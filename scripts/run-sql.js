const { Pool } = require('pg');
const fs = require('fs');
const _path = require('path');
require('dotenv').config();

// Configurações do PostgreSQL
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function runSqlFile(filePath) {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    console.log(`Lendo arquivo SQL: ${filePath}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    console.log('Executando script SQL...');
    await client.query(sql);
    
    console.log('✅ Script SQL executado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao executar o script SQL:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar o script SQL passado como argumento
const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Por favor, especifique o arquivo SQL a ser executado');
  process.exit(1);
}

runSqlFile(sqlFile).catch(console.error);
