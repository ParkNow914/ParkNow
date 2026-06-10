const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const { exec } = require('child_process');
const _execAsync = promisify(exec);
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configurações
const LOG_FILE = path.join(__dirname, '../../logs/maintenance.log');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;

// Configuração do PostgreSQL — senha obrigatória via ambiente (sem fallback).
if (!process.env.PG_PASSWORD) {
  console.error('Erro: defina a variável de ambiente PG_PASSWORD antes de executar este script.');
  process.exit(1);
}
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD,
  port: parseInt(process.env.PG_PORT) || 5432,
};

// Configuração do e-mail
const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  from: process.env.EMAIL_FROM || 'noreply@parknow.com',
  to: process.env.ADMIN_EMAIL || 'admin@example.com',
};

const transporter = nodemailer.createTransport({
  service: emailConfig.service,
  auth: emailConfig.auth,
});

// Função para registrar logs
async function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  // Criar diretório de logs se não existir
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Registrar no console e no arquivo de log
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_FILE, logMessage);
  
  // Enviar alerta por e-mail se for um erro
  if (level === 'ERROR') {
    await sendAlert(`Erro na manutenção do banco de dados: ${message}`).catch(console.error);
  }
}

// Função para enviar alertas por e-mail
async function sendAlert(message) {
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('Configuração de e-mail incompleta. Não é possível enviar alertas.');
    return;
  }

  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to: emailConfig.to,
      subject: '⚠️ Alerta de Manutenção do Banco de Dados',
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #e74c3c;">⚠️ Alerta de Manutenção do Banco de Dados</h2>
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #e74c3c; margin: 10px 0;">
            <p style="margin: 0; color: #2c3e50;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color: #7f8c8d; font-size: 12px; margin-top: 20px;">
            Esta é uma mensagem automática. Por favor, não responda este e-mail.
          </p>
        </div>
      `,
    });
    await log('Alerta de manutenção enviado por e-mail');
  } catch (error) {
    console.error('Falha ao enviar e-mail de alerta:', error);
  }
}

// Função para executar VACUUM ANALYZE
async function runVacuumAnalyze(client) {
  try {
    await log('Iniciando VACUUM ANALYZE...');
    const startTime = Date.now();
    
    // Executar VACUUM ANALYZE em todas as tabelas
    await client.query('VACUUM ANALYZE');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await log(`VACUUM ANALYZE concluído em ${duration}s`);
    
    return { success: true, duration };
  } catch (error) {
    const errorMsg = `Erro ao executar VACUUM ANALYZE: ${error.message}`;
    await log(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

// Função para reconstruir índices
async function reindexDatabase(client) {
  try {
    await log('Iniciando reconstrução de índices...');
    const startTime = Date.now();
    
    // Obter lista de tabelas
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    await log(`Reconstruindo índices para ${result.rows.length} tabelas...`);
    
    // Reconstruir índices para cada tabela
    for (const row of result.rows) {
      const table = row.tablename;
      try {
        await client.query(`REINDEX TABLE "${table}"`);
        await log(`  ✅ Índices reconstruídos para a tabela ${table}`);
      } catch (error) {
        await log(`  ❌ Erro ao reconstruir índices para ${table}: ${error.message}`, 'WARN');
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await log(`Reconstrução de índices concluída em ${duration}s`);
    
    return { success: true, duration, tables: result.rows.length };
  } catch (error) {
    const errorMsg = `Erro ao reconstruir índices: ${error.message}`;
    await log(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

// Função para limpar backups antigos
async function cleanupOldBackups() {
  try {
    await log(`Limpando backups com mais de ${RETENTION_DAYS} dias...`);
    const files = await readdir(BACKUP_DIR);
    const now = Date.now();
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.sql') && !file.endsWith('.sql.gz')) continue;
      
      const filePath = path.join(BACKUP_DIR, file);
      const fileStat = await stat(filePath);
      const fileAgeDays = (now - fileStat.mtimeMs) / (1000 * 60 * 60 * 24);
      
      if (fileAgeDays > RETENTION_DAYS) {
        try {
          await unlink(filePath);
          await log(`  🗑️ Backup removido: ${file} (${Math.floor(fileAgeDays)} dias)`);
          deletedCount++;
        } catch (error) {
          await log(`  ❌ Erro ao remover ${file}: ${error.message}`, 'WARN');
        }
      }
    }
    
    await log(`Limpeza concluída: ${deletedCount} backups antigos removidos`);
    return { success: true, deletedCount };
  } catch (error) {
    const errorMsg = `Erro ao limpar backups antigos: ${error.message}`;
    await log(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

// Função para verificar estatísticas do banco de dados
async function checkDatabaseStats(client) {
  try {
    await log('Coletando estatísticas do banco de dados...');
    
    const stats = {
      tables: [],
      totalSize: 0,
      tableCount: 0,
      indexCount: 0,
      activeConnections: 0,
    };
    
    // Tamanho das tabelas
    const tablesResult = await client.query(`
      SELECT 
        table_schema,
        table_name, 
        pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) as total_size,
        pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') as size_bytes,
        (SELECT count(*) FROM pg_indexes WHERE tablename = table_name) as index_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') DESC;
    `);
    
    // Contagem de conexões ativas
    const connectionsResult = await client.query(
      'SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = $1',
      [pgConfig.database]
    );
    
    stats.tables = tablesResult.rows;
    stats.tableCount = tablesResult.rows.length;
    stats.totalSize = tablesResult.rows.reduce((sum, table) => sum + parseInt(table.size_bytes || 0), 0);
    stats.indexCount = tablesResult.rows.reduce((sum, table) => sum + parseInt(table.index_count || 0), 0);
    stats.activeConnections = parseInt(connectionsResult.rows[0].active_connections);
    
    await log(`Estatísticas coletadas: ${stats.tableCount} tabelas, ${stats.indexCount} índices, ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB totais`);
    
    return { success: true, stats };
  } catch (error) {
    const errorMsg = `Erro ao coletar estatísticas: ${error.message}`;
    await log(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  }
}

// Função principal
async function runMaintenance() {
  const startTime = Date.now();
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    await log('🚀 Iniciando manutenção do banco de dados');
    
    // 1. Coletar estatísticas iniciais
    const statsBefore = await checkDatabaseStats(client);
    
    // 2. Executar VACUUM ANALYZE
    const _vacuumResult = await runVacuumAnalyze(client);
    
    // 3. Reconstruir índices
    const reindexResult = await reindexDatabase(client);
    
    // 4. Coletar estatísticas finais
    const statsAfter = await checkDatabaseStats(client);
    
    // 5. Limpar backups antigos
    const cleanupResult = await cleanupOldBackups();
    
    // 6. Calcular resumo
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = `
    📊 RESUMO DA MANUTENÇÃO
    ========================
    • Tempo total: ${duration} segundos
    • Tabelas otimizadas: ${statsAfter.stats?.tableCount || 'N/A'}
    • Tamanho total: ${(statsAfter.stats?.totalSize / 1024 / 1024).toFixed(2)} MB
    • Índices reconstruídos: ${reindexResult.tables || 'N/A'} tabelas
    • Backups removidos: ${cleanupResult.deletedCount || 0} arquivos
    • Conexões ativas: ${statsAfter.stats?.activeConnections || 'N/A'}
    `;
    
    await log(summary);
    await log('✅ Manutenção concluída com sucesso!');
    
    // Enviar resumo por e-mail
    await sendAlert(`Manutenção do banco de dados concluída em ${duration} segundos.\n\n${summary}`);
    
    return { success: true, duration, statsBefore, statsAfter };
  } catch (error) {
    const errorMsg = `Erro durante a manutenção: ${error.message}`;
    await log(errorMsg, 'ERROR');
    return { success: false, error: errorMsg };
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runMaintenance()
    .then(({ success }) => process.exit(success ? 0 : 1))
    .catch(() => process.exit(1));
}

module.exports = { runMaintenance };
