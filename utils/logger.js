// utils/logger.js
// Configuração do logger usando Winston

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
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

// Adiciona transporte para arquivos SE o diretório existir.
// Usa winston-daily-rotate-file para rotação automática + compressão de logs antigos.
if (fs.existsSync(logDir)) {
    const rotateBase = {
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: logFormat,
        handleExceptions: true,
    };

    // 2. Arquivo de Erros (rotacionado diariamente)
    transports.push(
        new DailyRotateFile({
            ...rotateBase,
            level: 'error',
            filename: path.join(logDir, 'error-%DATE%.log'),
        })
    );
    // 3. Arquivo Combinado
    transports.push(
        new DailyRotateFile({
            ...rotateBase,
            level: 'info',
            filename: path.join(logDir, 'combined-%DATE%.log'),
            maxSize: '50m',
            maxFiles: '7d',
            handleExceptions: false,
        })
    );
    // 4. Arquivo HTTP (Access Log)
    transports.push(
        new DailyRotateFile({
            ...rotateBase,
            level: 'http',
            filename: path.join(logDir, 'access-%DATE%.log'),
            format: winston.format.combine(winston.format.printf(({ message }) => message)),
            maxSize: '50m',
            maxFiles: '7d',
            handleExceptions: false,
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
