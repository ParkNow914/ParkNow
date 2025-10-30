const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: process.env.PG_PORT || 5432,
});

async function addCreatedAtColumn() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Check if column already exists
        const checkQuery = `
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'vagas' AND column_name = 'created_at';
        `;
        
        const result = await client.query(checkQuery);
        
        if (result.rows.length === 0) {
            // Add the column
            console.log('Adding created_at column to vagas table...');
            await client.query(`
                ALTER TABLE vagas 
                ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
            `);
            console.log('Successfully added created_at column');
        } else {
            console.log('created_at column already exists');
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding created_at column:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addCreatedAtColumn()
    .then(() => console.log('Migration completed'))
    .catch(err => console.error('Migration failed:', err));
