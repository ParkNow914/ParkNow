const { Pool } = require('pg');
require('dotenv').config();

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function listTables() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log('Listando tabelas no banco de dados PostgreSQL:');
    
    // Listar tabelas
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('\nTabelas encontradas:');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    
    // Contar registros em cada tabela
    console.log('\nContagem de registros por tabela:');
    for (const row of result.rows) {
      const tableName = row.table_name;
      try {
        const countResult = await client.query(`SELECT COUNT(*) FROM "${tableName}"`);
        console.log(`- ${tableName}: ${countResult.rows[0].count} registros`);
      } catch (error) {
        console.error(`  ❌ Erro ao contar registros da tabela ${tableName}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('Erro ao listar tabelas:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

listTables();
