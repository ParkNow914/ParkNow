const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do pool de conexões
const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'parknow_db',
    max: 1, // Usamos apenas 1 conexão para migrações
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Iniciando migração da tabela veiculos...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // Verifica se a tabela já existe
        const tableExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'veiculos'
            )`
        );
        
        if (tableExists.rows[0].exists) {
            console.log('A tabela veiculos já existe. Nenhuma ação necessária.');
            await client.query('COMMIT');
            return;
        }
        
        // Cria a tabela veiculos
        console.log('Criando tabela veiculos...');
        await client.query(`
            CREATE TABLE veiculos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo_veiculo VARCHAR(20) NOT NULL,
                placa_veiculo VARCHAR(10) NOT NULL,
                padrao BOOLEAN NOT NULL DEFAULT FALSE,
                data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(usuario_id, placa_veiculo)
            );
        `);
        
        // Cria o índice
        console.log('Criando índice em veiculos.usuario_id...');
        await client.query('CREATE INDEX idx_veiculos_usuario_id ON veiculos(usuario_id);');
        
        // Migra os veículos existentes da tabela de usuários para a nova tabela
        console.log('Migrando veículos existentes...');
        await client.query(`
            INSERT INTO veiculos (usuario_id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao)
            SELECT id, tipo_veiculo, placa_veiculo, TRUE, NOW(), NOW()
            FROM usuarios 
            WHERE tipo_veiculo IS NOT NULL 
            AND placa_veiculo IS NOT NULL
            ON CONFLICT (usuario_id, placa_veiculo) DO NOTHING;
        `);
        
        // Confirma a transação
        await client.query('COMMIT');
        console.log('Migração concluída com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro durante a migração:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration()
    .then(() => {
        console.log('Script de migração finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar migração:', err);
        process.exit(1);
    });
