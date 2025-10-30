const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: process.env.PG_PORT || 5432,
});

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Read the migration file
        const migrationSql = fs.readFileSync(
            path.join(__dirname, '../migrations/add_vagas_column.sql'), 
            'utf8'
        );
        
        // Execute the migration
        await client.query(migrationSql);
        await client.query('COMMIT');
        console.log('Migração para adicionar coluna vagas concluída com sucesso!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao executar migração:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
