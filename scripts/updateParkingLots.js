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

async function updateParkingLots() {
    const client = await pool.connect();
    try {
        // Update JJ ESTACIONAMENTO coordinates
        await client.query(
            `UPDATE estacionamentos 
             SET latitude = $1, longitude = $2 
             WHERE id = 6`, 
            ['-22.731242024336957', '-45.12425994232729']
        );
        console.log('Coordenadas do JJ ESTACIONAMENTO atualizadas com sucesso!');

        // Verify the updates
        const result = await client.query(
            'SELECT id, nome, latitude, longitude, vagas, status FROM estacionamentos'
        );
        console.log('Estacionamentos atualizados:');
        console.table(result.rows);

    } catch (error) {
        console.error('Erro ao atualizar estacionamentos:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

updateParkingLots();
