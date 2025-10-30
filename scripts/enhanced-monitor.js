const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configurações
const LOG_FILE = path.join(__dirname, '../logs/db-monitor.log');
const ALERT_THRESHOLDS = {
  DISK_USAGE_PERCENT: 80,
  ACTIVE_CONNECTIONS: 50,
  SLOW_QUERY_MS: 1000, // 1 segundo
};

// Configurações do banco de dados
const pgConfig = {
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || '91827364Now#',
  port: process.env.PG_PORT || 5432,
};

// Configuração do e-mail para alertas
const emailConfig = {
  service: 'gmail', // ou outro serviço de e-mail
  auth: {
    user: process.env.EMAIL_USER || 'seu-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'sua-senha',
  },
  to: process.env.ADMIN_EMAIL || 'admin@example.com',
};

const transporter = nodemailer.createTransport({
  service: emailConfig.service,
  auth: emailConfig.auth,
});

// Função para registrar logs
function log(message, level = 'INFO') {
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
    sendAlert(message).catch(console.error);
  }
}

// Função para enviar alertas por e-mail
async function sendAlert(message) {
  try {
    await transporter.sendMail({
      from: `"Monitor de Banco de Dados" <${emailConfig.auth.user}>`,
      to: emailConfig.to,
      subject: '🚨 Alerta do Monitor de Banco de Dados',
      text: message,
      html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
    });
    log('Alerta enviado por e-mail com sucesso');
  } catch (error) {
    console.error('Falha ao enviar e-mail de alerta:', error);
  }
}

// Função para monitorar uso do disco
async function checkDiskUsage(client) {
  try {
    const query = `
      SELECT 
        total_bytes / 1024 / 1024 as total_mb,
        (total_bytes - free_bytes) / 1024 / 1024 as used_mb,
        (free_bytes * 100 / total_bytes) as free_percent
      FROM (
        SELECT 
          SUM(pg_database_size(datname)) as total_bytes,
          SUM(pg_tablespace_size('pg_default')) as free_bytes
        FROM pg_database
        WHERE datname = $1
      ) t;
    `;
    
    const result = await client.query(query, [pgConfig.database]);
    
    if (result.rows.length > 0) {
      const { total_mb, used_mb, free_percent } = result.rows[0];
      const usedPercent = 100 - parseFloat(free_percent);
      
      log(`Uso de disco: ${used_mb.toFixed(2)}MB / ${total_mb.toFixed(2)}MB (${usedPercent.toFixed(2)}%)`);
      
      if (usedPercent > ALERT_THRESHOLDS.DISK_USAGE_PERCENT) {
        const msg = `⚠️ Alerta: Uso de disco em ${usedPercent.toFixed(2)}% (limite: ${ALERT_THRESHOLDS.DISK_USAGE_PERCENT}%)`;
        log(msg, 'ERROR');
      }
    }
  } catch (error) {
    log(`Erro ao verificar uso de disco: ${error.message}`, 'ERROR');
  }
}

// Função para monitorar conexões ativas
async function checkActiveConnections(client) {
  try {
    const query = `
      SELECT count(*) as active_connections
      FROM pg_stat_activity 
      WHERE datname = $1;
    `;
    
    const result = await client.query(query, [pgConfig.database]);
    
    if (result.rows.length > 0) {
      const activeConnections = parseInt(result.rows[0].active_connections);
      log(`Conexões ativas: ${activeConnections}`);
      
      if (activeConnections > ALERT_THRESHOLDS.ACTIVE_CONNECTIONS) {
        const msg = `⚠️ Alerta: ${activeConnections} conexões ativas (limite: ${ALERT_THRESHOLDS.ACTIVE_CONNECTIONS})`;
        log(msg, 'ERROR');
      }
    }
  } catch (error) {
    log(`Erro ao verificar conexões ativas: ${error.message}`, 'ERROR');
  }
}

// Função para monitorar consultas lentas
async function checkSlowQueries(client) {
  try {
    const query = `
      SELECT 
        query,
        total_exec_time,
        calls,
        mean_exec_time,
        rows,
        shared_blks_read,
        shared_blks_hit
      FROM pg_stat_statements
      WHERE mean_exec_time > $1
      ORDER BY mean_exec_time DESC
      LIMIT 5;
    `;
    
    const result = await client.query(query, [ALERT_THRESHOLDS.SLOW_QUERY_MS]);
    
    if (result.rows.length > 0) {
      log('🔍 Consultas lentas encontradas:');
      
      result.rows.forEach((row, index) => {
        const queryText = row.query.replace(/\s+/g, ' ').substring(0, 100) + '...';
        const msg = `${index + 1}. Média: ${row.mean_exec_time.toFixed(2)}ms | Chamadas: ${row.calls} | ${queryText}`;
        log(msg);
        
        // Enviar alerta para consultas muito lentas
        if (row.mean_exec_time > ALERT_THRESHOLDS.SLOW_QUERY_MS * 2) {
          log(`⚠️ Consulta muito lenta: ${row.mean_exec_time.toFixed(2)}ms (limite: ${ALERT_THRESHOLDS.SLOW_QUERY_MS}ms)`, 'ERROR');
        }
      });
    }
  } catch (error) {
    log(`Erro ao verificar consultas lentas: ${error.message}`, 'ERROR');
  }
}

// Função principal
async function main() {
  const pool = new Pool(pgConfig);
  const client = await pool.connect();
  
  try {
    log('Iniciando monitoramento do banco de dados...');
    
    // Habilitar extensão pg_stat_statements se não estiver habilitada
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
    
    // Executar verificações
    await checkDiskUsage(client);
    await checkActiveConnections(client);
    await checkSlowQueries(client);
    
    log('Monitoramento concluído com sucesso!');
  } catch (error) {
    log(`Erro no monitoramento: ${error.message}`, 'ERROR');
  } finally {
    client.release();
    await pool.end();
  }
}

// Executar o monitoramento
main().catch(console.error);

// Exportar para uso em outros módulos
module.exports = { main };
