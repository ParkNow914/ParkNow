// config/index.js
require('dotenv').config();
const path = require('path');
const crypto = require('crypto'); // Importa crypto para gerar segredos
const logger = require('../utils/logger'); // Importa APÓS dotenv

const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 3000;

// --- Segredos JWT ---
// Em produção a ausência é erro fatal (defesa em profundidade: o envValidator
// também aborta o startup). Em desenvolvimento gera um segredo temporário por
// processo — útil localmente, mas invalida tokens a cada restart.
let jwtSecret = process.env.JWT_SECRET;
let jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

if (!jwtSecret || !jwtRefreshSecret) {
    if (isProduction) {
        throw new Error('FATAL: JWT_SECRET e JWT_REFRESH_SECRET são obrigatórios em produção.');
    }
    if (!jwtSecret) {
        jwtSecret = crypto.randomBytes(32).toString('hex');
        logger.warn('AVISO: JWT_SECRET não definido no .env! Gerando segredo temporário (somente dev).');
    }
    if (!jwtRefreshSecret) {
        jwtRefreshSecret = crypto.randomBytes(32).toString('hex');
        logger.warn('AVISO: JWT_REFRESH_SECRET não definido no .env! Gerando segredo temporário (somente dev).');
    }
}
// --- Fim Segredos JWT ---

const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: port,
    frontendUrl: process.env.FRONTEND_URL || `http://localhost:${port}`,
    // Configurações do PostgreSQL
    db: {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: process.env.PG_DATABASE || 'parknow_db',
      username: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      }
    },
    jwt: {
        secret: jwtSecret, // Usa a variável (definida ou gerada)
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshSecret: jwtRefreshSecret, // Usa a variável (definida ou gerada)
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    // --- Configuração de Email Otimizada para Gmail ---
    email: {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false, // false para porta 587, true para 465
        requireTLS: true, // Força o uso de TLS
        tls: {
            rejectUnauthorized: false // Aceita certificados autoassinados
        },
        pool: true, // Habilita conexões em pool
        maxConnections: 5, // Número máximo de conexões simultâneas
        maxMessages: 100, // Número máximo de mensagens por conexão
        rateDelta: 1000, // Intervalo entre envios em ms
        rateLimit: 5, // Número máximo de mensagens por rateDelta
        auth: {
            // Sem defaults com credenciais reais. Configure EMAIL_USER e EMAIL_PASS
            // no .env — em produção o envValidator aborta o startup se faltar.
            user: process.env.EMAIL_USER || '',
            pass: process.env.EMAIL_PASS || ''
        },
        from: process.env.EMAIL_FROM || '"ParkNow" <no-reply@example.com>',
        support: process.env.EMAIL_SUPPORT || '',
        admin: process.env.EMAIL_ADMIN || '',
        // Configurações adicionais para melhorar a entrega
        dkim: {
            domainName: 'parknow.com.br', // Substitua pelo seu domínio
            keySelector: 'default',
            privateKey: process.env.DKIM_PRIVATE_KEY || '' // Adicione sua chave DKIM privada se tiver
        },
        // Headers padrão para melhorar a entrega
        headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'Importance': 'high',
            'X-Mailer': 'ParkNow Mailer',
            'X-Auto-Response-Suppress': 'OOF, AutoReply'
        }
    },
    // --- Fim Configuração Email ---
    // Política única de cookies (mesma usada em server.js): httpOnly sempre,
    // secure em produção e sameSite=Lax em todos os ambientes. O frontend é
    // servido pela própria aplicação (mesma origem), então 'Lax' funciona e
    // protege contra CSRF. 'None' exigiria secure=true e abriria cross-site.
    cookieProps: { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' },
    // --- Configuração Redis (DESABILITADA) ---
    // redis: { 
    //     host: process.env.REDIS_HOST || 'localhost', 
    //     port: process.env.REDIS_PORT || 6379, 
    //     // Outras configurações de Redis comentadas 
    // },
    cache: { defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '60'), estacionamentosListTTL: parseInt(process.env.CACHE_EST_LIST_TTL || '300'), checkperiod: 120 },
    realtime: { enabled: (process.env.REALTIME_ENABLED !== 'false') },
    timezone: { 
        default: process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo',
        offsetHours: parseInt(process.env.TIMEZONE_OFFSET_HOURS || '-3'), // Offset em horas para o Brasil (UTC-3)
        forceUTC: (process.env.FORCE_UTC === 'true') || false // Se true, força todos os timestamps para UTC
    },
    cron: { expireReservasSchedule: process.env.CRON_EXPIRE_RESERVAS || '*/5 * * * *', updateTempoSchedule: process.env.CRON_UPDATE_TEMPO || '*/1 * * * *' }, // Removido cron blacklist
    uploads: { path: path.resolve(__dirname, '..', 'uploads'), maxFileSize: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5') * 1024 * 1024, allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'] },
    reserva: { bufferOcupadaHoras: parseFloat(process.env.RESERVA_BUFFER_OCUPADA_H || '2') },
    // Configurações do PIX (fluxo manual, sem gateway).
    // O BR Code é gerado localmente (utils/pixBrCode.js); aqui ficam apenas
    // parâmetros de tempo/notificação usados pelo fluxo manual.
    pix: {
        // Tempo (em segundos) que uma cobrança PIX pendente fica viva
        chargeExpiresIn: parseInt(process.env.PIX_CHARGE_EXPIRES_IN || '3600', 10),

        // Notificação ao cliente sobre status do pagamento
        notifyCustomer: process.env.PIX_NOTIFY_CUSTOMER !== 'false',
        notifyEmail: process.env.PIX_NOTIFY_EMAIL || process.env.EMAIL_ADMIN || ''
    }
};

// Validações essenciais (JWT já validado/gerado acima)
if (!config.email.host || !config.email.auth.user || !config.email.auth.pass) { logger.warn("AVISO: Configuração de EMAIL_* incompleta/padrão. Reset de senha pode não enviar emails reais."); }

module.exports = config;