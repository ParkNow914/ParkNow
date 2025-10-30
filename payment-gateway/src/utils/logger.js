const winston = require('winston');
const { combine, timestamp, printf, colorize, json } = winston.format;

// Defina o nível de log com base no ambiente
const level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Formato para produção (JSON estruturado)
const productionFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  json()
);

// Formato para desenvolvimento (legível no console)
const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    // Adiciona metadados se existirem
    if (Object.keys(meta).length > 0) {
      log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    return log;
  })
);

// Crie o logger
const logger = winston.createLogger({
  level,
  format: process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'payment-gateway' },
  transports: [
    // Escreva todos os logs com nível 'error' e abaixo para 'error.log'
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    }),
    // Escreva todos os logs com nível 'info' e abaixo para 'combined.log'
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    })
  ],
  exitOnError: false // Não encerre em erros tratados
});

// Se não estivermos em produção, também registre no console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: developmentFormat
  }));
}

// Função para criar um logger filho com metadados adicionais
logger.child = function (meta) {
  return this.defaultMeta ? 
    Object.assign({}, this, { defaultMeta: { ...this.defaultMeta, ...meta } }) : 
    Object.assign({}, this, { defaultMeta: meta });
};

// Função para logar erros não tratados
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  // Encerre o processo para evitar estado inconsistente
  process.exit(1);
});

module.exports = logger;
