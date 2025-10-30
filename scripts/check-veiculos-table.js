const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Database configuration
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: parseInt(process.env.PG_PORT) || 5432,
});

async function checkAndCreateTable() {
    const client = await pool.connect();
    try {
        // Check if veiculos table exists
        const checkTable = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'veiculos'
            );
        `);

        const tableExists = checkTable.rows[0].exists;

        if (!tableExists) {
            logger.info('Creating veiculos table...');
            
            // Read the migration file
            const migrationPath = path.join(__dirname, '..', 'migrations', '20240529_add_veiculos_table.sql');
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
            
            // Execute the migration
            await client.query(migrationSQL);
            logger.info('Successfully created veiculos table');
        } else {
            logger.info('veiculos table already exists');
        }
    } catch (error) {
        logger.error('Error checking/creating veiculos table:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the check
checkAndCreateTable()
    .then(() => {
        logger.info('Database check completed');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Database check failed:', error);
        process.exit(1);
    });
