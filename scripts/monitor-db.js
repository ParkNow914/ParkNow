const { Pool } = require('pg');
require('dotenv').config();

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function monitorDatabase() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log('📊 Iniciando monitoramento do banco de dados...');
    
    // Verificar conexões ativas
    const connections = await client.query(`
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE datname = $1
    `, [process.env.PG_DATABASE]);
    
    console.log(`🔌 Conexões ativas: ${connections.rows[0].active_connections}`);
    
    // Verificar tamanho do banco de dados
    const dbSize = await client.query(`
      SELECT pg_size_pretty(pg_database_size($1)) as size
    `, [process.env.PG_DATABASE]);
    
    console.log(`💾 Tamanho do banco de dados: ${dbSize.rows[0].size}`);
    
    // Verificar tabelas maiores
    const largeTables = await client.query(`
      SELECT 
        table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
      LIMIT 5
    `);
    
    console.log('\n📋 Tabelas mais pesadas:');
    largeTables.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.table_name}: ${row.size}`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao monitorar o banco de dados:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar a cada 5 minutos
monitorDatabase();
setInterval(monitorDatabase, 5 * 60 * 1000);
