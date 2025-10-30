const { Pool } = require('pg');
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
        
        console.log('Starting migration: Adding payment fields to estacionamentos table');
        
        // Verifica se a coluna já existe antes de adicionar
        const checkColumn = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'estacionamentos' AND column_name = 'chave_pix';
        `);
        
        if (checkColumn.rows.length === 0) {
            // Adiciona a coluna chave_pix
            await client.query(`
                ALTER TABLE estacionamentos 
                ADD COLUMN chave_pix VARCHAR(255) NULL;
                
                COMMENT ON COLUMN estacionamentos.chave_pix IS 'Chave PIX do estacionamento (CNPJ)';
            `);
            console.log('Added column: chave_pix');
        } else {
            console.log('Column chave_pix already exists');
        }
        
        // Adiciona a coluna aceita_cartao_credito
        await client.query(`
            ALTER TABLE estacionamentos 
            ADD COLUMN IF NOT EXISTS aceita_cartao_credito BOOLEAN NOT NULL DEFAULT FALSE;
            
            COMMENT ON COLUMN estacionamentos.aceita_cartao_credito IS 'Se o estacionamento aceita cartão de crédito';
        `);
        console.log('Added column: aceita_cartao_credito');
        
        // Adiciona a coluna aceita_cartao_debito
        await client.query(`
            ALTER TABLE estacionamentos 
            ADD COLUMN IF NOT EXISTS aceita_cartao_debito BOOLEAN NOT NULL DEFAULT FALSE;
            
            COMMENT ON COLUMN estacionamentos.aceita_cartao_debito IS 'Se o estacionamento aceita cartão de débito';
        `);
        console.log('Added column: aceita_cartao_debito');
        
        // Adiciona a coluna dados_pagamento
        await client.query(`
            ALTER TABLE estacionamentos 
            ADD COLUMN IF NOT EXISTS dados_pagamento JSONB NULL;
            
            COMMENT ON COLUMN estacionamentos.dados_pagamento IS 'Configurações adicionais de pagamento';
        `);
        console.log('Added column: dados_pagamento');
        
        // Cria um índice na coluna chave_pix para buscas mais rápidas
        const checkIndex = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'estacionamentos' AND indexname = 'idx_estacionamentos_chave_pix';
        `);
        
        if (checkIndex.rows.length === 0) {
            await client.query(`
                CREATE INDEX idx_estacionamentos_chave_pix ON estacionamentos(chave_pix);
            `);
            console.log('Created index: idx_estacionamentos_chave_pix');
        } else {
            console.log('Index idx_estacionamentos_chave_pix already exists');
        }
        
        await client.query('COMMIT');
        console.log('Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error running migration:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
