const { Pool } = require('pg');
require('dotenv').config();

// Configurações do PostgreSQL
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function checkTables() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log('Conectado ao PostgreSQL. Verificando tabelas...');
    
    // Obter todas as tabelas
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`\nTabelas encontradas (${result.rows.length}):`);
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    
    // Verificar estrutura de cada tabela
    for (const row of result.rows) {
      const tableName = row.table_name;
      console.log(`\n📋 Estrutura da tabela: ${tableName}`);
      
      // Obter colunas
      const columns = await client.query(`
        SELECT 
          column_name, 
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      console.log('Colunas:');
      console.table(columns.rows);
      
      // Obter índices
      const indexes = await client.query(`
        SELECT 
          indexname, 
          indexdef
        FROM pg_indexes
        WHERE tablename = $1
      `, [tableName]);
      
      if (indexes.rows.length > 0) {
        console.log('\nÍndices:');
        console.table(indexes.rows);
      } else {
        console.log('\nSem índices definidos.');
      }
    }
    
  } catch (error) {
    console.error('Erro ao verificar tabelas:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables().catch(console.error);
