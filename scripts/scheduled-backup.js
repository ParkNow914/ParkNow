const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { exec } = require('child_process');
require('dotenv').config();

// Configurações
const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 7; // Manter os últimos 7 backups
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_FILE = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log');

// Configurações do banco de dados
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

// Função para registrar logs
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
}

// Função para rotacionar backups
function rotateBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      return;
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('backup-') && file.endsWith('.sql'))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Manter apenas os MAX_BACKUPS mais recentes
    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      toDelete.forEach(file => {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, file.name));
          log(`Arquivo antigo removido: ${file.name}`);
        } catch (err) {
          log(`Erro ao remover arquivo ${file.name}: ${err.message}`);
        }
      });
    }
  } catch (error) {
    log(`Erro na rotação de backups: ${error.message}`);
  }
}

// Função para fazer o backup usando pg_dump
async function runPgDump() {
  return new Promise((resolve, reject) => {
    const command = `pg_dump -U ${pgConfig.user} -h ${pgConfig.host} -p ${pgConfig.port} -d ${pgConfig.database} -f ${BACKUP_FILE}`;
    const env = { ...process.env, PGPASSWORD: pgConfig.password };

    exec(command, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Falha ao executar pg_dump: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

// Função principal
async function main() {
  log('Iniciando processo de backup...');
  
  try {
    // Criar diretório de backups se não existir
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      log(`Diretório de backup criado: ${BACKUP_DIR}`);
    }

    // Fazer o backup
    log(`Iniciando backup para: ${BACKUP_FILE}`);
    await runPgDump();
    log('Backup concluído com sucesso!');

    // Rotacionar backups antigos
    log('Rotacionando backups antigos...');
    rotateBackups();
    log('Rotação de backups concluída.');

  } catch (error) {
    log(`❌ ERRO: ${error.message}`);
    process.exit(1);
  }
}

// Executar o script
main();
