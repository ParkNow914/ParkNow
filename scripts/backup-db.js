const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const backupDir = path.join(__dirname, '../backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `backup-${timestamp}.sql`);

// Criar diretório de backups se não existir
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const command = `pg_dump -U ${process.env.PG_USER} -h ${process.env.PG_HOST} -p ${process.env.PG_PORT} -d ${process.env.PG_DATABASE} -f ${backupFile}`;

console.log('🔄 Iniciando backup do banco de dados...');

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Erro ao fazer backup:', error);
    return;
  }
  if (stderr) {
    console.error('⚠️  Aviso durante o backup:', stderr);
  }
  console.log(`✅ Backup concluído com sucesso! Arquivo salvo em: ${backupFile}`);
});
