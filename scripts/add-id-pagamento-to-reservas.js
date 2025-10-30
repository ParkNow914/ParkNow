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

async function addIdPagamentoToReservas() {
    const client = await pool.connect();
    try {
        console.log('Verificando a coluna id_pagamento na tabela reservas...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // Verifica se a coluna já existe
        const columnExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'reservas' 
                AND column_name = 'id_pagamento'
            )`
        );

        if (columnExists.rows[0].exists) {
            console.log('A coluna id_pagamento já existe na tabela reservas.');
            
            // Verifica se a restrição de chave estrangeira existe
            const constraintExists = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.table_constraints 
                    WHERE constraint_name = 'fk_reserva_pagamento'
                    AND table_name = 'reservas'
                )`
            );
            
            if (!constraintExists.rows[0].exists) {
                console.log('Adicionando restrição de chave estrangeira...');
                await client.query(`
                    ALTER TABLE reservas 
                    ADD CONSTRAINT fk_reserva_pagamento
                    FOREIGN KEY (id_pagamento) 
                    REFERENCES pagamentos(id) 
                    ON DELETE SET NULL;
                `);
                console.log('Restrição de chave estrangeira adicionada com sucesso!');
            }
            
            await client.query('COMMIT');
            return;
        }

        // Adiciona a coluna id_pagamento
        console.log('Adicionando a coluna id_pagamento...');
        await client.query(`
            ALTER TABLE reservas 
            ADD COLUMN id_pagamento INTEGER;
        `);

        // Adiciona a restrição de chave estrangeira
        console.log('Adicionando restrição de chave estrangeira...');
        await client.query(`
            ALTER TABLE reservas 
            ADD CONSTRAINT fk_reserva_pagamento
            FOREIGN KEY (id_pagamento) 
            REFERENCES pagamentos(id) 
            ON DELETE SET NULL;
        `);

        // Confirma a transação
        await client.query('COMMIT');
        console.log('Coluna id_pagamento adicionada com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro ao adicionar a coluna id_pagamento:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addIdPagamentoToReservas()
    .then(() => {
        console.log('Script de atualização finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar atualização:', err);
        process.exit(1);
    });
