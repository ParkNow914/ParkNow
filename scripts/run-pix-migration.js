const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const config = require('../config');

const pool = new Pool({
  user: config.db.username,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('Iniciando migração para adicionar colunas PIX...');
    
    // Ler o arquivo de migração
    const migrationPath = path.join(
      __dirname, 
      '..', 
      'migrations', 
      '20240623_add_pix_columns_to_estacionamentos.sql'
    );
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Executar a migração
    await client.query(migrationSQL);
    
    await client.query('COMMIT');
    console.log('Migração concluída com sucesso!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao executar migração:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
