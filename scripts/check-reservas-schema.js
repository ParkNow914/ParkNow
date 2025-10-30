const { Pool } = require('pg');
const logger = require('../utils/logger');

// Database configuration
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: parseInt(process.env.PG_PORT) || 5432,
});

async function checkReservasSchema() {
    const client = await pool.connect();
    try {
        // Check if id_pagamento column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reservas' 
            AND column_name = 'id_pagamento';
        `);

        if (columnCheck.rows.length === 0) {
            logger.info('id_pagamento column does not exist in reservas table');
            
            // Get current table structure
            const tableInfo = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'reservas';
            `);
            
            logger.info('Current reservas table structure:', tableInfo.rows);
            
            // Generate migration SQL
            const migrationSQL = `
                ALTER TABLE reservas 
                ADD COLUMN IF NOT EXISTS id_pagamento VARCHAR(100),
                ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(50) DEFAULT 'pendente';
                
                -- Add index for better query performance
                CREATE INDEX IF NOT EXISTS idx_reservas_id_pagamento ON reservas(id_pagamento);
            `;
            
            logger.info('Generated migration SQL:', migrationSQL);
            
            // Execute the migration
            await client.query('BEGIN');
            await client.query(migrationSQL);
            await client.query('COMMIT');
            
            logger.info('Successfully added id_pagamento and status_pagamento columns to reservas table');
        } else {
            logger.info('id_pagamento column already exists in reservas table');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error checking/updating reservas table schema:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the check
checkReservasSchema()
    .then(() => {
        logger.info('Database schema check completed');
        process.exit(0);
    })
    .catch((error) => {
        logger.error('Database schema check failed:', error);
        process.exit(1);
    });
