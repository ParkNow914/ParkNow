const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const backupDir = path.join(__dirname, '../backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

// Criar diretório de backups se não existir
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

async function getTableNames(client) {
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  return result.rows.map(row => row.table_name);
}

async function backupTable(client, tableName, outputStream) {
  // Obter estrutura da tabela
  const createTable = await client.query(`
    SELECT pg_get_tabledef('public.${tableName}'::regclass) as create_table;
  `);
  
  // Escrever comando CREATE TABLE
  outputStream.write(`\n-- Estrutura da tabela ${tableName}\n`);
  outputStream.write(createTable.rows[0].create_table + ';\n\n');
  
  // Obter dados da tabela
  const data = await client.query(`SELECT * FROM "${tableName}"`);
  
  if (data.rows.length > 0) {
    outputStream.write(`-- Dados da tabela ${tableName}\n`);
    
    // Inserir dados
    for (const row of data.rows) {
      const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
      const values = Object.values(row).map(v => 
        v === null ? 'NULL' : `'${v.toString().replace(/'/g, "''")}'`
      ).join(', ');
      
      outputStream.write(`INSERT INTO "${tableName}" (${columns}) VALUES (${values});\n`);
    }
  }
  
  outputStream.write('\n');
}

async function backupDatabase() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  const outputStream = fs.createWriteStream(backupFile);
  
  try {
    console.log('🔄 Iniciando backup do banco de dados...');
    
    // Escrever cabeçalho
    outputStream.write(`-- Backup do banco de dados ${pgConfig.database}\n`);
    outputStream.write(`-- Gerado em: ${new Date().toISOString()}\n\n`);
    
    // Obter lista de tabelas
    const tables = await getTableNames(client);
    
    // Fazer backup de cada tabela
    for (const table of tables) {
      console.log(`  Fazendo backup da tabela ${table}...`);
      await backupTable(client, table, outputStream);
    }
    
    console.log(`✅ Backup concluído com sucesso! Arquivo salvo em: ${backupFile}`);
  } catch (error) {
    console.error('❌ Erro ao fazer backup:', error);
  } finally {
    outputStream.end();
    client.release();
    await pool.end();
  }
}

backupDatabase();
