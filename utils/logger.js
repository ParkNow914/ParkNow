// utils/logger.js
// Configuração do logger usando Winston

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Diretório de Logs
const logDir = path.resolve(__dirname, '..', 'logs'); // Usa path.resolve para caminho absoluto
// Cria diretório se não existir
if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir, { recursive: true }); // recursive: true para criar pais se necessário
    } catch (error) {
        console.error(`Falha CRÍTICA ao criar diretório de logs ${logDir}:`, error);
        // Considerar encerrar ou continuar sem logs em arquivo
    }
}

// Níveis de Log (padrão npm)
const logLevels = winston.config.npm.levels;

// Formato de Log Comum
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }), // Inclui stack trace formatado
  winston.format.splat(),
  // Formato printf customizado
  winston.format.printf(({ level, message, timestamp, stack, metadata }) => {
    let log = `${timestamp} ${level}: ${message}`; // Nível em maiúsculas já vem do colorize/format
    // Adiciona metadados se existirem e não forem o próprio erro
    if (metadata && Object.keys(metadata).length > 0 && !(metadata instanceof Error)) {
        // Tenta stringify, mas com tratamento para objetos circulares
         try { log += ` ${JSON.stringify(metadata, (key, value) => typeof value === 'bigint' ? value.toString() : value )}`; } // Converte BigInt
         catch (e) { log += ` [Metadata não serializável]`; }
    }
    // Adiciona stack trace se existir (formatado pelo winston.format.errors)
    if (stack) { log += `\n${stack}`; }
    return log;
  })
);

// Transportes (Destinos dos Logs)
const transports = [
  // 1. Console
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }), // Colore toda a linha
      logFormat
    ),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', // Menos verboso em prod
    handleExceptions: true, // Captura exceções não tratadas
    // handleRejections: true, // Ativar se usar Node >= 15 e quiser capturar rejections
  }),
];

// Adiciona transporte para arquivos SE o diretório existir
if (fs.existsSync(logDir)) {
    // 2. Arquivo de Erros
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'), level: 'error', format: logFormat,
            maxsize: 5 * 1024 * 1024, maxFiles: 5, tailable: true,
            handleExceptions: true, /* handleRejections: true */
        })
    );
    // 3. Arquivo Combinado
    transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'), level: 'info', format: logFormat,
            maxsize: 10 * 1024 * 1024, maxFiles: 3, tailable: true,
        })
    );
    // 4. Arquivo HTTP (Access Log)
     transports.push(
        new winston.transports.File({
            filename: path.join(logDir, 'access.log'), level: 'http',
            // Formato mais simples, específico para Morgan/HTTP
            format: winston.format.combine( winston.format.printf(({ message }) => message) ),
            maxsize: 10 * 1024 * 1024, maxFiles: 3, tailable: true,
        })
    );
} else {
    console.warn("AVISO: Diretório de logs não pôde ser acessado/criado. Logs em arquivo desabilitados.");
}

// Cria a instância principal do Logger
const logger = winston.createLogger({
  levels: logLevels,
  format: logFormat, // Formato padrão para transportes sem formato específico
  transports: transports,
  exitOnError: false, // Não encerra em erros internos do logger
});

// Stream para Morgan (usará o nível 'http')
logger.stream = { write: (message) => { logger.http(message.trim()); }, };

logger.info('[Logger] Logger Winston configurado.');
logger.debug(`[Logger] Nível Console: ${logger.transports.find(t=>t instanceof winston.transports.Console)?.level}`);

module.exports = logger;