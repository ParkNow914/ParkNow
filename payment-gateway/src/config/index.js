require('dotenv').config();
const path = require('path');
const Joi = require('joi');

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

// Define o ambiente (development, test, production)
const env = process.env.NODE_ENV || 'development';

// Esquema de validação para as configurações
const envVarsSchema = Joi.object({
  // Configurações da aplicação
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  APP_NAME: Joi.string().default('payment-gateway'),
  APP_VERSION: Joi.string().default('1.0.0'),
  API_PREFIX: Joi.string().default('/api/v1'),
  
  // Configurações de segurança
  JWT_SECRET: Joi.string().required().description('JWT secret key'),
  JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
  JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
  JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number().default(10).description('minutes after which reset password token expires'),
  JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number().default(10).description('minutes after which verify email token expires'),
  
  // Configurações do Mercado Pago
  MP_ACCESS_TOKEN: Joi.string().required().description('Mercado Pago Access Token'),
  MP_PUBLIC_KEY: Joi.string().required().description('Mercado Pago Public Key'),
  MP_RECEIVER_PRIMARY_ID: Joi.string().required().description('Mercado Pago Primary Receiver ID (ParkNow)'),
  MP_RECEIVER_SECONDARY_ID: Joi.string().required().description('Mercado Pago Secondary Receiver ID (Estacionamento)'),
  MP_WEBHOOK_URL: Joi.string().uri().description('Mercado Pago Webhook URL'),
  MP_NOTIFICATION_URL: Joi.string().uri().description('Mercado Pago Notification URL'),
  MP_PLATFORM_FEE: Joi.number().default(0.10).description('Taxa da plataforma (ex: 0.10 para 10%)'),
  
  // Configurações de banco de dados
  DATABASE_URL: Joi.string().required().description('PostgreSQL connection string'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database connection'),
  DB_POOL_MIN: Joi.number().default(2).description('Minimum number of database connections in pool'),
  DB_POOL_MAX: Joi.number().default(20).description('Maximum number of database connections in pool'),
  
  // Configurações de CORS
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins (comma-separated)'),
  
  // Configurações de rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000).description('Rate limit window in milliseconds'),
  RATE_LIMIT_MAX: Joi.number().default(100).description('Maximum number of requests per window'),
  
  // Configurações de log
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  LOG_FILE: Joi.string().description('Path to log file'),
  LOG_FILE_MAX_SIZE: Joi.string().default('5m').description('Maximum log file size'),
  LOG_FILE_MAX_FILES: Joi.string().default('14d').description('Maximum number of log files to keep'),
  
  // Configurações de e-mail (opcional)
  SMTP_HOST: Joi.string().description('Server that will send the emails'),
  SMTP_PORT: Joi.number().description('Port to connect to the email server'),
  SMTP_USERNAME: Joi.string().description('Username for email server'),
  SMTP_PASSWORD: Joi.string().description('Password for email server'),
  EMAIL_FROM: Joi.string().description('The from field in the emails sent by the app'),
  
  // Configurações de cache (opcional)
  REDIS_URL: Joi.string().description('Redis connection string'),
  CACHE_TTL: Joi.number().default(300).description('Cache TTL in seconds'),
  
  // Configurações de fila (opcional)
  QUEUE_CONNECTION: Joi.string().description('Queue connection string (Redis, etc.)'),
  
  // Configurações de monitoramento (opcional)
  SENTRY_DSN: Joi.string().description('Sentry DSN for error tracking'),
  NEW_RELIC_LICENSE_KEY: Joi.string().description('New Relic license key'),
  
  // Configurações de armazenamento (opcional)
  STORAGE_PROVIDER: Joi.string().valid('local', 's3', 'gcs').default('local'),
  AWS_ACCESS_KEY_ID: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  AWS_REGION: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  AWS_BUCKET_NAME: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  
  // Configurações de ambiente específicas
  ...(env === 'production' ? {
    // Configurações específicas para produção
    NODE_ENV: Joi.string().valid('production').default('production'),
    PORT: Joi.number().default(80),
    LOG_LEVEL: Joi.string().default('info'),
    CORS_ORIGIN: Joi.string().required().description('CORS allowed origins for production (comma-separated)'),
  } : {
    // Configurações para desenvolvimento/teste
    NODE_ENV: Joi.string().valid('development', 'test').default('development'),
    PORT: Joi.number().default(3000),
    LOG_LEVEL: Joi.string().default('debug'),
  })
}).unknown();

// Valida as variáveis de ambiente
const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Erro de configuração: ${error.message}`);
}

// Configuração base
const config = {
  // Configurações da aplicação
  env: envVars.NODE_ENV,
  isDevelopment: envVars.NODE_ENV === 'development',
  isTest: envVars.NODE_ENV === 'test',
  isProduction: envVars.NODE_ENV === 'production',
  port: envVars.PORT,
  appName: envVars.APP_NAME,
  appVersion: envVars.APP_VERSION,
  apiPrefix: envVars.API_PREFIX,
  
  // Configurações de segurança
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
    cookieOptions: {
      httpOnly: true,
      secure: envVars.NODE_ENV === 'production',
      sameSite: 'strict', // ou 'lax' para compatibilidade
      maxAge: envVars.JWT_ACCESS_EXPIRATION_MINUTES * 60 * 1000,
    },
  },
  
  // Configurações do Mercado Pago
  mercadoPago: {
    accessToken: envVars.MP_ACCESS_TOKEN,
    publicKey: envVars.MP_PUBLIC_KEY,
    receiverIds: {
      primary: envVars.MP_RECEIVER_PRIMARY_ID,   // ParkNow
      secondary: envVars.MP_RECEIVER_SECONDARY_ID // Estacionamento
    },
    platformFee: parseFloat(envVars.MP_PLATFORM_FEE) || 0.10, // 10% por padrão
    webhookUrl: envVars.MP_WEBHOOK_URL,
    notificationUrl: envVars.MP_NOTIFICATION_URL,
    apiUrl: envVars.NODE_ENV === 'production' 
      ? 'https://api.mercadopago.com'
      : 'https://api.mercadopago.com', // Sandbox é controlado pelo access token
  },
  
  // Configurações de banco de dados
  database: {
    url: envVars.DATABASE_URL,
    ssl: envVars.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    pool: {
      min: parseInt(envVars.DB_POOL_MIN, 10) || 2,
      max: parseInt(envVars.DB_POOL_MAX, 10) || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, '../database/migrations'),
    },
    seeds: {
      directory: path.join(__dirname, '../database/seeds'),
    },
  },
  
  // Configurações de CORS
  cors: {
    origin: envVars.CORS_ORIGIN ? envVars.CORS_ORIGIN.split(',').map(origin => origin.trim()) : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Authorization', 'X-Total-Count', 'X-Pagination'],
    credentials: true,
    maxAge: 600, // 10 minutos
  },
  
  // Configurações de rate limiting
  rateLimit: {
    windowMs: parseInt(envVars.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(envVars.RATE_LIMIT_MAX, 10) || 100, // limite de requisições por janela
    standardHeaders: true, // Retorna informações de rate limit nos cabeçalhos
    legacyHeaders: false, // Desabilita os cabeçalhos X-RateLimit-*
    message: 'Muitas requisições deste IP, por favor tente novamente mais tarde.',
  },
  
  // Configurações de log
  logging: {
    level: envVars.LOG_LEVEL,
    file: {
      enabled: !!envVars.LOG_FILE,
      path: envVars.LOG_FILE || 'logs/app.log',
      maxSize: envVars.LOG_FILE_MAX_SIZE || '5m',
      maxFiles: envVars.LOG_FILE_MAX_FILES || '14d',
    },
    console: {
      enabled: true,
      level: envVars.LOG_LEVEL === 'debug' ? 'debug' : 'info',
      colorize: true,
    },
  },
  
  // Configurações de e-mail (opcional)
  email: envVars.SMTP_HOST ? {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT || 587,
    secure: envVars.SMTP_PORT == 465, // true para 465, false para outras portas
    auth: {
      user: envVars.SMTP_USERNAME,
      pass: envVars.SMTP_PASSWORD,
    },
    from: envVars.EMAIL_FROM || `"${envVars.APP_NAME}" <noreply@example.com>`,
  } : null,
  
  // Configurações de cache (opcional)
  cache: envVars.REDIS_URL ? {
    url: envVars.REDIS_URL,
    ttl: parseInt(envVars.CACHE_TTL, 10) || 300, // 5 minutos por padrão
  } : {
    // Cache em memória (apenas para desenvolvimento)
    store: 'memory',
    ttl: 60, // 1 minuto
  },
  
  // Configurações de fila (opcional)
  queue: {
    connection: envVars.QUEUE_CONNECTION || envVars.REDIS_URL,
    defaultQueue: 'default',
    prefix: `${envVars.APP_NAME}:queue:`,
  },
  
  // Configurações de monitoramento (opcional)
  sentry: envVars.SENTRY_DSN ? {
    dsn: envVars.SENTRY_DSN,
    environment: envVars.NODE_ENV,
    release: `${envVars.APP_NAME}@${envVars.APP_VERSION}`,
  } : null,
  
  newRelic: envVars.NEW_RELIC_LICENSE_KEY ? {
    licenseKey: envVars.NEW_RELIC_LICENSE_KEY,
    appName: envVars.APP_NAME,
    logLevel: envVars.NODE_ENV === 'production' ? 'info' : 'debug',
  } : null,
  
  // Configurações de armazenamento (opcional)
  storage: {
    provider: envVars.STORAGE_PROVIDER || 'local',
    local: {
      path: path.join(process.cwd(), 'uploads'),
      baseUrl: '/uploads',
    },
    s3: envVars.AWS_ACCESS_KEY_ID ? {
      accessKeyId: envVars.AWS_ACCESS_KEY_ID,
      secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
      region: envVars.AWS_REGION,
      bucket: envVars.AWS_BUCKET_NAME,
      acl: 'public-read',
    } : null,
  },
  
  // Configurações específicas para pagamentos
  payments: {
    // Configurações de split de pagamento
    split: {
      enabled: true,
      platformFee: parseFloat(envVars.MP_PLATFORM_FEE) || 0.10, // 10% por padrão
      minAmount: 1.00, // Valor mínimo para permitir split
      maxInstallments: 12, // Número máximo de parcelas
      // Configurações de reembolso
      refund: {
        enabled: true,
        maxDays: 180, // Número máximo de dias para permitir reembolso
        feeRefundable: false, // Se a taxa da plataforma é reembolsável
      },
    },
    // Configurações de notificação
    notification: {
      email: {
        enabled: !!envVars.SMTP_HOST,
        templateDir: path.join(__dirname, '../emails'),
      },
      webhook: {
        enabled: true,
        timeout: 5000, // 5 segundos
        maxRetries: 3,
        retryDelay: 1000, // 1 segundo
      },
    },
    // Configurações de PIX
    pix: {
      enabled: true,
      expirationTime: 3600, // 1 hora em segundos
    },
  },
};

// Validação de configurações obrigatórias
const requiredInProduction = [
  'MP_ACCESS_TOKEN',
  'MP_PUBLIC_KEY',
  'MP_RECEIVER_PRIMARY_ID',
  'MP_RECEIVER_SECONDARY_ID',
  'JWT_SECRET',
  'DATABASE_URL',
];

if (config.isProduction) {
  requiredEnvVars.push('ALLOWED_ORIGINS');
}

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`Erro: As seguintes variáveis de ambiente são obrigatórias: ${missingVars.join(', ')}`);
  process.exit(1);
}

module.exports = config;
