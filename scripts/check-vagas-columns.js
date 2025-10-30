const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: process.env.PG_PORT || 5432,
});

async function checkColumns() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'vagas';
        `);
        
        console.log('Columns in vagas table:');
        console.table(res.rows);
        
        const hasCreatedAt = res.rows.some(col => col.column_name === 'created_at');
        console.log(`\nCreated_at column exists: ${hasCreatedAt ? '✅ Yes' : '❌ No'}`);
        
    } catch (error) {
        console.error('Error checking columns:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkColumns();
