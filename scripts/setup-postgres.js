const { Pool } = require('pg');
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config();

// Configuração do PostgreSQL
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
  database: 'postgres' // Conecta ao banco padrão primeiro
};

// Nome do banco de dados que queremos usar
const dbName = process.env.PG_DATABASE || 'parknow_db';

async function setupDatabase() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();

  try {
    console.log(`🔍 Verificando se o banco de dados '${dbName}' existe...`);
    
    // Verifica se o banco de dados existe
    const dbCheck = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1', 
      [dbName]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`🔄 Criando banco de dados '${dbName}'...`);
      // Cria o banco de dados
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Banco de dados '${dbName}' criado com sucesso!`);
      
      // Executa as migrações
      console.log('🔄 Executando migrações...');
      try {
        execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });
        console.log('✅ Migrações executadas com sucesso!');
      } catch (error) {
        console.error('❌ Erro ao executar migrações:', error);
      }
    } else {
      console.log(`✅ O banco de dados '${dbName}' já existe.`);
    }

    // Verifica as tabelas existentes
    console.log('\n📋 Tabelas no banco de dados:');
    const tables = await client.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = 'public' 
       ORDER BY table_name`
    );

    if (tables.rows.length > 0) {
      tables.rows.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.table_name}`);
      });
    } else {
      console.log('  Nenhuma tabela encontrada.');
    }

  } catch (error) {
    console.error('❌ Erro ao configurar o banco de dados:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Executa a configuração
setupDatabase().then(() => {
  console.log('\n✅ Configuração do banco de dados concluída!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro durante a configuração:', error);
  process.exit(1);
});
