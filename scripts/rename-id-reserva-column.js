const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'parknow_db',
    max: 1,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

async function renameIdReservaColumn() {
    const client = await pool.connect();
    try {
        console.log('Iniciando renomeação da coluna id_reserva para reserva_id...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // 1. Verifica se a coluna id_reserva existe
        const idReservaExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'id_reserva'
            )`
        );

        if (!idReservaExists.rows[0].exists) {
            console.log('A coluna id_reserva não existe na tabela pagamentos.');
            await client.query('COMMIT');
            return;
        }

        // 2. Remove a chave estrangeira existente
        console.log('Removendo chave estrangeira existente...');
        await client.query(`
            ALTER TABLE pagamentos 
            DROP CONSTRAINT IF EXISTS pagamentos_id_reserva_fkey;
        `);

        // 3. Renomeia a coluna
        console.log('Renomeando coluna id_reserva para reserva_id...');
        await client.query(`
            ALTER TABLE pagamentos 
            RENAME COLUMN id_reserva TO reserva_id;
        `);

        // 4. Recria a chave estrangeira com o novo nome
        console.log('Recriando chave estrangeira...');
        await client.query(`
            ALTER TABLE pagamentos 
            ADD CONSTRAINT fk_pagamentos_reserva
            FOREIGN KEY (reserva_id) 
            REFERENCES reservas(id) 
            ON DELETE CASCADE;
        `);

        // 5. Confirma a transação
        await client.query('COMMIT');
        console.log('Renomeação concluída com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro durante a renomeação:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

renameIdReservaColumn()
    .then(() => {
        console.log('Script de renomeação finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar renomeação:', err);
        process.exit(1);
    });
