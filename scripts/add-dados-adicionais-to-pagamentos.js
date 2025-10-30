const { Pool } = require('pg');
const logger = require('../utils/logger');
require('dotenv').config({ path: '../.env' });

async function runMigration() {
    const pool = new Pool({
        user: 'postgres',
        host: process.env.PG_HOST || 'localhost',
        database: process.env.PG_DATABASE || 'parknow_db',
        password: process.env.PG_PASSWORD || '91827364Now#',
        port: parseInt(process.env.PG_PORT) || 5432,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        // Check if the column already exists
        const checkQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'pagamentos' 
            AND column_name = 'dados_adicionais'
        `;
        
        const result = await client.query(checkQuery);
        
        if (result.rows.length === 0) {
            // Column doesn't exist, add it
            await client.query(`
                ALTER TABLE pagamentos 
                ADD COLUMN dados_adicionais JSONB DEFAULT '{}'::jsonb
            `);
            logger.info('Coluna dados_adicionais adicionada à tabela pagamentos');
        } else {
            logger.info('Coluna dados_adicionais já existe na tabela pagamentos');
        }
        
        await client.query('COMMIT');
        logger.info('Migração concluída com sucesso');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao executar migração:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the migration
runMigration()
    .then(() => {
        console.log('Migração concluída');
        process.exit(0);
    })
    .catch(error => {
        console.error('Erro na migração:', error);
        process.exit(1);
    });
