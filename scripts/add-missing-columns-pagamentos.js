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

async function addMissingColumns() {
    const client = await pool.connect();
    try {
        console.log('Verificando colunas ausentes na tabela pagamentos...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // Lista de colunas para verificar/adicionar
        const columnsToAdd = [
            {
                name: 'data_criacao',
                type: 'TIMESTAMP WITH TIME ZONE',
                defaultValue: 'CURRENT_TIMESTAMP',
                nullable: true
            },
            {
                name: 'data_atualizacao',
                type: 'TIMESTAMP WITH TIME ZONE',
                defaultValue: 'CURRENT_TIMESTAMP',
                nullable: true
            },
            {
                name: 'data_vencimento',
                type: 'TIMESTAMP WITH TIME ZONE',
                nullable: true
            },
            {
                name: 'codigo_pix',
                type: 'TEXT',
                nullable: true
            },
            {
                name: 'qr_code',
                type: 'TEXT',
                nullable: true
            }
        ];

        for (const column of columnsToAdd) {
            // Verifica se a coluna já existe
            const columnExists = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'pagamentos' 
                    AND column_name = $1
                )`,
                [column.name]
            );

            if (!columnExists.rows[0].exists) {
                console.log(`Adicionando coluna ${column.name}...`);
                
                let alterTableQuery = `
                    ALTER TABLE pagamentos 
                    ADD COLUMN ${column.name} ${column.type}`;
                
                if (column.nullable === false) {
                    alterTableQuery += ' NOT NULL';
                }
                
                if (column.defaultValue) {
                    alterTableQuery += ` DEFAULT ${column.defaultValue}`;
                }
                
                alterTableQuery += ';';
                
                await client.query(alterTableQuery);
                console.log(`Coluna ${column.name} adicionada com sucesso!`);
            } else {
                console.log(`A coluna ${column.name} já existe.`);
            }
        }

        // Verifica se a coluna created_at existe para renomear para data_criacao
        const createdAtExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'created_at'
            )`
        );

        // Verifica se data_criacao já existe
        const dataCriacaoExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'data_criacao'
            )`
        );

        if (createdAtExists.rows[0].exists && !dataCriacaoExists.rows[0].exists) {
            console.log('Renomeando coluna created_at para data_criacao...');
            await client.query(`
                ALTER TABLE pagamentos 
                RENAME COLUMN created_at TO data_criacao;
            `);
            console.log('Coluna created_at renomeada para data_criacao com sucesso!');
        } else if (createdAtExists.rows[0].exists && dataCriacaoExists.rows[0].exists) {
            console.log('Ambas as colunas created_at e data_criacao existem. Removendo created_at...');
            // Copia dados de created_at para data_criacao se estiver vazia
            await client.query(`
                UPDATE pagamentos 
                SET data_criacao = created_at 
                WHERE data_criacao IS NULL;
                
                ALTER TABLE pagamentos 
                DROP COLUMN IF EXISTS created_at;
            `);
            console.log('Coluna created_at removida após copiar dados para data_criacao.');
        }

        // Verifica se a coluna updated_at existe para renomear para data_atualizacao
        const updatedAtExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'updated_at'
            )`
        );

        // Verifica se data_atualizacao já existe
        const dataAtualizacaoExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos' 
                AND column_name = 'data_atualizacao'
            )`
        );

        if (updatedAtExists.rows[0].exists && !dataAtualizacaoExists.rows[0].exists) {
            console.log('Renomeando coluna updated_at para data_atualizacao...');
            await client.query(`
                ALTER TABLE pagamentos 
                RENAME COLUMN updated_at TO data_atualizacao;
            `);
            console.log('Coluna updated_at renomeada para data_atualizacao com sucesso!');
        } else if (updatedAtExists.rows[0].exists && dataAtualizacaoExists.rows[0].exists) {
            console.log('Ambas as colunas updated_at e data_atualizacao existem. Removendo updated_at...');
            // Copia dados de updated_at para data_atualizacao se estiver vazia
            await client.query(`
                UPDATE pagamentos 
                SET data_atualizacao = updated_at 
                WHERE data_atualizacao IS NULL;
                
                ALTER TABLE pagamentos 
                DROP COLUMN IF EXISTS updated_at;
            `);
            console.log('Coluna updated_at removida após copiar dados para data_atualizacao.');
        }

        // Confirma a transação
        await client.query('COMMIT');
        console.log('Todas as colunas foram verificadas/atualizadas com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro durante a verificação/atualização das colunas:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addMissingColumns()
    .then(() => {
        console.log('Script de atualização de colunas finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar atualização de colunas:', err);
        process.exit(1);
    });
