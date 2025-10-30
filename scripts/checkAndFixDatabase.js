const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '',
    port: process.env.PG_PORT || 5432,
});

async function checkAndFixDatabase() {
    const client = await pool.connect();
    try {
        // 1. Check the structure of the 'vagas' table
        console.log('Checking database structure...');
        
        // Check if 'vagas' table exists and has the required columns
        const checkTable = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'vagas';
        `);
        
        console.log('Current columns in vagas table:');
        console.table(checkTable.rows);
        
        // 2. Check if there are any spots for Silcar (estacionamento_id = 5)
        const checkSilcarSpots = await client.query(
            'SELECT COUNT(*) as total, status FROM vagas WHERE estacionamento_id = 5 GROUP BY status'
        );
        console.log('\nSilcar parking spots status:');
        console.table(checkSilcarSpots.rows);
        
        // 3. Check the query that's failing
        console.log('\nTesting the failing query...');
        try {
            const testQuery = await client.query(
                'SELECT * FROM vagas WHERE estacionamento_id = 6 AND status = $1',
                ['livre']
            );
            console.log(`Found ${testQuery.rows.length} free spots for estacionamento_id=6`);
        } catch (error) {
            console.error('Error testing query:', error.message);
        }
        
        // 4. Check if we need to add the created_at column
        const hasCreatedAt = checkTable.rows.some(col => col.column_name === 'created_at');
        
        if (!hasCreatedAt) {
            console.log('\nAdding missing created_at column to vagas table...');
            await client.query(`
                ALTER TABLE vagas 
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            `);
            console.log('Added created_at column to vagas table');
        }
        
        // 5. Check if we need to create spots for Silcar
        const silcarSpots = await client.query(
            'SELECT COUNT(*) as count FROM vagas WHERE estacionamento_id = 5'
        );
        
        if (parseInt(silcarSpots.rows[0].count) === 0) {
            console.log('\nNo spots found for Silcar. Creating 50 spots...');
            
            // First, find the next available ID
            const maxIdResult = await client.query('SELECT COALESCE(MAX(id), 0) as max_id FROM vagas');
            let nextId = parseInt(maxIdResult.rows[0].max_id) + 1;
            
            // Then create spots with explicit IDs to avoid conflicts
            for (let i = 1; i <= 50; i++) {
                try {
                    await client.query(
                        'INSERT INTO vagas (id, numero, status, estacionamento_id, tipo_veiculo) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
                        [nextId, i, 'livre', 5, 'carro']
                    );
                    nextId++;
                } catch (error) {
                    console.error(`Error creating spot ${i}:`, error.message);
                    nextId++; // Try next ID if current one fails
                }
            }
            console.log('Created 50 spots for Silcar');
        }
        
        // 6. Verify the fix for the available spots count
        const availableSpots = await client.query(`
            SELECT e.id, e.nome, e.vagas as total_spots,
                   COUNT(CASE WHEN v.status = 'livre' THEN 1 END) as available_spots
            FROM estacionamentos e
            LEFT JOIN vagas v ON e.id = v.estacionamento_id
            WHERE e.id IN (5, 6)
            GROUP BY e.id, e.nome, e.vagas
        `);
        
        console.log('\nParking spots summary:');
        console.table(availableSpots.rows);
        
    } catch (error) {
        console.error('Error checking/fixing database:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkAndFixDatabase();
