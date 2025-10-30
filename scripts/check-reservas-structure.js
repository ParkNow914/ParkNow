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

async function checkReservasStructure() {
    const client = await pool.connect();
    try {
        console.log('Verificando estrutura da tabela reservas...');
        
        // Verifica colunas da tabela
        const columns = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'reservas';
        `);
        
        console.log('\nColunas da tabela reservas:');
        console.table(columns.rows);
        
        // Verifica restrições
        const constraints = await client.query(`
            SELECT tc.constraint_name, tc.constraint_type, 
                   tc.table_name, kcu.column_name, 
                   ccu.table_name AS foreign_table_name,
                   ccu.column_name AS foreign_column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.table_name = 'reservas';
        `);
        
        console.log('\nRestrições da tabela reservas:');
        console.table(constraints.rows);
        
    } catch (error) {
        console.error('Erro ao verificar estrutura:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

checkReservasStructure()
    .then(() => {
        console.log('\nVerificação concluída!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar verificação:', err);
        process.exit(1);
    });
