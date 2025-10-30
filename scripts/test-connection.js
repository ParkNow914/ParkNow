const { Pool } = require('pg');
require('dotenv').config();

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function testConnection() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log('🔍 Testando conexão com o PostgreSQL...');
    
    // Testar conexão
    await client.query('SELECT NOW()');
    console.log('✅ Conexão com o PostgreSQL bem-sucedida!');
    
    // Testar consulta em cada tabela
    const tables = ['usuarios', 'admins', 'estacionamentos', 'vagas', 'reservas', 'logs_veiculos', 'logs_admins', 'tipos_veiculos'];
    
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`✅ Tabela ${table}: ${result.rows[0].count} registros encontrados`);
      } catch (error) {
        console.error(`❌ Erro ao acessar tabela ${table}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Falha ao testar conexão:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testConnection();
