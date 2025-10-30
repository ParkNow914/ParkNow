const { Pool } = require('pg');
require('dotenv').config();

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function optimizeDatabase() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log('🔄 Executando VACUUM ANALYZE...');
    await client.query('VACUUM ANALYZE');
    console.log('✅ Otimização do banco de dados concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao otimizar o banco de dados:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

optimizeDatabase();
