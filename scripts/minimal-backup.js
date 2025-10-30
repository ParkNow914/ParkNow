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

async function backupDatabase() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  const outputStream = fs.createWriteStream(backupFile);
  
  try {
    console.log('🔄 Iniciando backup do banco de dados...');
    
    // Obter lista de tabelas
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Adicionar cabeçalho
    outputStream.write(`-- Backup do banco de dados ${pgConfig.database}\n`);
    outputStream.write(`-- Gerado em: ${new Date().toISOString()}\n\n`);
    
    // Fazer backup de cada tabela
    for (const table of tables) {
      console.log(`  Fazendo backup da tabela ${table}...`);
      
      // Obter estrutura da tabela
      const structure = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      
      // Gerar comando CREATE TABLE
      outputStream.write(`\n-- Estrutura da tabela ${table}\n`);
      outputStream.write(`CREATE TABLE IF NOT EXISTS "${table}" (\n`);
      
      const columns = [];
      for (const col of structure.rows) {
        let colDef = `  "${col.column_name}" ${col.data_type}`;
        
        // Adicionar NOT NULL se aplicável
        if (col.is_nullable === 'NO') {
          colDef += ' NOT NULL';
        }
        
        // Adicionar valor padrão se existir
        if (col.column_default) {
          colDef += ` DEFAULT ${col.column_default}`;
        }
        
        columns.push(colDef);
      }
      
      outputStream.write(columns.join(',\n') + '\n);\n\n');
      
      // Obter e escrever dados da tabela
      const data = await client.query(`SELECT * FROM "${table}"`);
      
      if (data.rows.length > 0) {
        outputStream.write(`-- Dados da tabela ${table}\n`);
        
        // Inserir dados
        for (const row of data.rows) {
          const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
          const values = Object.values(row).map(v => 
            v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
          ).join(', ');
          
          outputStream.write(`INSERT INTO "${table}" (${columns}) VALUES (${values});\n`);
        }
        outputStream.write('\n');
      }
    }
    
    console.log(`✅ Backup concluído com sucesso! Arquivo salvo em: ${backupFile}`);
  } catch (error) {
    console.error('❌ Erro ao fazer backup:', error.message);
  } finally {
    outputStream.end();
    client.release();
    await pool.end();
  }
}

backupDatabase();
