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

async function addDadosAdicionaisColumn() {
    const client = await pool.connect();
    try {
        console.log('Verificando a coluna dados_adicionais...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // Verifica se a coluna já existe
        const columnExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'dados_adicionais'
            )`
        );

        if (columnExists.rows[0].exists) {
            console.log('A coluna dados_adicionais já existe na tabela pagamentos.');
            await client.query('COMMIT');
            return;
        }

        // Adiciona a coluna dados_adicionais
        console.log('Adicionando a coluna dados_adicionais...');
        await client.query(`
            ALTER TABLE pagamentos 
            ADD COLUMN dados_adicionais JSONB;
        `);

        // Confirma a transação
        await client.query('COMMIT');
        console.log('Coluna dados_adicionais adicionada com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro ao adicionar a coluna:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addDadosAdicionaisColumn()
    .then(() => {
        console.log('Script de atualização finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar atualização:', err);
        process.exit(1);
    });
