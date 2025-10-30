const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
});

async function checkConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Conexão com o PostgreSQL estabelecida com sucesso!');
    
    // Verificar se o banco de dados existe
    const dbCheck = await client.query(
      "SELECT datname FROM pg_database WHERE datname = $1", 
      [process.env.PG_DATABASE || 'parknow_db']
    );
    
    if (dbCheck.rows.length > 0) {
      console.log(`✅ Banco de dados '${process.env.PG_DATABASE || 'parknow_db'}' encontrado.`);
    } else {
      console.log(`❌ Banco de dados '${process.env.PG_DATABASE || 'parknow_db'}' não encontrado.`);
    }
    
    // Verificar tabelas existentes
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    
    console.log('\n📋 Tabelas no banco de dados:');
    if (tables.rows.length > 0) {
      tables.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.table_name}`);
      });
    } else {
      console.log('  Nenhuma tabela encontrada.');
    }
    
  } catch (error) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', error.message);
    console.error('Detalhes:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

checkConnection();
