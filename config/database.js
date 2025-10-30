const { Pool } = require('pg');
const logger = require('../utils/logger');

// Configuração do pool de conexões
const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'parknow_db',
    max: parseInt(process.env.PG_MAX_CONNECTIONS || '100'),
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000'),
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '2000'),
    application_name: 'parknow-api',
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

// Log de conexão bem-sucedida
pool.on('connect', () => {
    logger.info('Nova conexão estabelecida com o banco de dados');
});

// Log de erros do pool
pool.on('error', (err) => {
    logger.error('Erro inesperado no cliente do banco de dados', {
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code
        }
    });
});

// Testa a conexão com o banco de dados
async function testConnection() {
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT NOW() as current_time');
        logger.info('Conexão com o banco de dados testada com sucesso', {
            currentTime: res.rows[0].current_time,
            serverVersion: client.serverVersion,
            database: process.env.PG_DATABASE,
            user: process.env.PG_USER,
            host: process.env.PG_HOST
        });
        client.release();
        return true;
    } catch (error) {
        logger.error('Falha ao conectar ao banco de dados', {
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            config: {
                host: process.env.PG_HOST,
                port: process.env.PG_PORT,
                database: process.env.PG_DATABASE,
                user: process.env.PG_USER
            }
        });
        throw error;
    }
}

// Executa uma query com tratamento de erros
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug('Query executada', {
            query: text,
            duration: `${duration}ms`,
            rows: res.rowCount
        });
        return res;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error('Erro ao executar query', {
            query: text,
            params,
            duration: `${duration}ms`,
            error: {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position,
                stack: error.stack
            }
        });
        throw error;
    }
}

// Obtém um cliente do pool para transações
async function getClient() {
    const client = await pool.connect();
    
    // Sobrescreve o método query para logar as queries executadas
    const query = client.query;
    const release = client.release;
    
    // Mantém o rastreamento de queries pendentes
    client.query = (...args) => {
        return query.apply(client, args);
    };
    
    // Adiciona logs ao liberar o cliente
    client.release = () => {
        release.apply(client);
    };
    
    return client;
}

// Exporta as funções e o pool
module.exports = {
    query,
    getClient,
    testConnection,
    pool
};
