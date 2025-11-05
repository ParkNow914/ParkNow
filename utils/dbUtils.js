const { Pool, types } = require('pg');
const logger = require('./logger');

// PostgreSQL connection pool configuration
const poolConfig = {
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: parseInt(process.env.PG_PORT) || 5432,
    max: parseInt(process.env.PG_MAX_CONNECTIONS) || 20,
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS) || 10000,
    maxUses: 7500,
    allowExitOnIdle: true,
    application_name: 'parknow_api',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Log the database configuration (without password)
const { password, ...poolConfigWithoutPassword } = poolConfig;
logger.info('Database Configuration:', {
    ...poolConfigWithoutPassword,
    password: password ? '***' : 'not set'
});

// Create the connection pool
let pool;

try {
    pool = new Pool(poolConfig);
    logger.info('Database pool created successfully');
} catch (error) {
    logger.error('Failed to create database pool:', error);
    throw error;
}

// Configure type parsers for timestamps (all in UTC)
const timestampOid = 1114; // OID for timestamp without timezone
const timestampTzOid = 1184; // OID for timestamp with timezone

types.setTypeParser(timestampOid, (val) => val === null ? null : new Date(val + 'Z'));
types.setTypeParser(timestampTzOid, (val) => val === null ? null : new Date(val + 'Z'));
types.setTypeParser(1082, (val) => val); // date
types.setTypeParser(1115, (val) => val); // timestamp[]
types.setTypeParser(1182, (val) => val); // date[]
types.setTypeParser(1185, (val) => val); // timestamptz[]

// Execute a query with parameters
async function query(text, params = []) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug(`Executed query in ${duration}ms`, { query: text, params });
        return res;
    } catch (error) {
        logger.error('Error executing query', { error, query: text, params });
        throw error;
    }
}

// Test the database connection
async function testConnection(retries = 5, delay = 2000) {
    let lastError;

    for (let i = 0; i < retries; i++) {
        let client;
        try {
            logger.info(`Attempting to connect to database (attempt ${i + 1}/${retries})...`);
            client = await pool.connect();
            const result = await client.query('SELECT NOW() as current_time');
            logger.info('Database connection successful', {
                current_time: result.rows[0].current_time,
                server_version: client.connectionParameters.server_version
            });
            return true;
        } catch (error) {
            lastError = error;
            const waitTime = delay * (i + 1);
            logger.error(`Connection attempt ${i + 1} failed: ${error.message}`, {
                error: {
                    code: error.code,
                    detail: error.detail,
                    hint: error.hint,
                    position: error.position
                },
                retryIn: `${waitTime}ms`
            });

            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    logger.error('Error releasing client:', releaseError);
                }
            }
        }
    }

    const errorMessage = `Failed to connect to database after ${retries} attempts: ${lastError.message}`;
    logger.error(errorMessage, { error: lastError });
    throw new Error(errorMessage);
}

// Close the connection pool
async function closePool() {
    try {
        await pool.end();
        logger.info('Database connection pool closed');
    } catch (error) {
        logger.error('Error closing database connection pool', { error });
        throw error;
    }
}

// Handle process termination
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Closing database connection pool...');
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Closing database connection pool...');
    await closePool();
    process.exit(0);
});

// Store the original query method
const originalQuery = pool.query.bind(pool);

// Create a wrapper for the query function with better error handling
const executeQuery = async (text, params) => {
    const start = Date.now();
    try {
        // Use the original query method to avoid recursion
        const result = await originalQuery(text, params);
        const duration = Date.now() - start;

        // Log successful queries (only in development or if debug is enabled)
        if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
            logger.debug(`Query executed in ${duration}ms`, {
                query: text,
                params: params || [],
                duration: `${duration}ms`,
                rowCount: result.rowCount
            });
        }

        return result;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error('Query execution failed', {
            query: text,
            params: params || [],
            duration: `${duration}ms`,
            error: {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position
            }
        });
        throw error;
    }
};

// Override the pool's query method
pool.query = async (text, params, callback) => {
    // Handle callback-style usage
    if (typeof params === 'function') {
        callback = params;
        params = [];
    }

    try {
        const result = await executeQuery(text, params);
        if (callback) {
            callback(null, result);
        }
        return result;
    } catch (error) {
        if (callback) {
            callback(error, null);
        } else {
            throw error;
        }
    }
};

module.exports = {
    getClient: async () => {
        try {
            const client = await pool.connect();
            return client;
        } catch (error) {
            logger.error('Failed to get database client:', error);
            throw error;
        }
    },
    query,
    testConnection,
    closePool: async () => {
        try {
            await pool.end();
            logger.info('Database connection pool closed');
        } catch (error) {
            logger.error('Error closing database connection pool:', error);
            throw error;
        }
    },
    pool,
    // For backward compatibility
    formatDate: (date) => date ? new Date(date).toISOString() : null,
    setClientTimezone: () => Promise.resolve()
};

// Test the connection when this module is loaded
if (require.main === module) {
    (async () => {
        try {
            await testConnection();
            process.exit(0);
        } catch (error) {
            process.exit(1);
        }
    })();
}
