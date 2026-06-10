// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');                     // Segurança HTTP Headers
const detectTimezone = require('./middleware/detectTimezone');  // Timezone detection middleware
const _rateLimit = require('express-rate-limit');     // Limita requisições (Rate Limiting)
const cookieParser = require('cookie-parser');         // Para ler/escrever cookies (refresh token)
const http = require('http');                          // Módulo HTTP nativo do Node.js (para Socket.IO)
const morgan = require('morgan');                      // Middleware para log HTTP
const config = require('./config');                  // Carrega configurações da aplicação (inclui .env)
const logger = require('./utils/logger');              // Logger customizado (Winston)
const { validateEnv } = require('./utils/envValidator'); // Validação fail-fast das variáveis de ambiente
const requestId = require('./middleware/requestId');   // Correlation id por requisição
const errorTracker = require('./utils/errorTracker');  // Error tracking facade (Sentry/Datadog/noop)
const { metricsMiddleware, metricsHandler } = require('./utils/metrics'); // Prometheus metrics
const { initSocketIO } = require('./services/socketService'); // Inicializador do Socket.IO
const { testConnection, closePool } = require('./utils/dbUtils'); // Utilitário de conexão com o banco de dados

// Validate environment early. In production a missing/invalid var aborts startup.
validateEnv(logger);

// Initialise error tracker (no-op unless SENTRY_DSN is set + @sentry/node installed).
errorTracker.init();

// Import routes
const apiRoutes = require('./routes');                 // Main API router (/api/*)
const approvalRoutes = require('./routes/approvalRoutes'); // Partner approval routes
const timeRoutes = require('./routes/timeRoutes');     // Time service routes
const healthRoutes = require('./routes/healthRoutes'); // Liveness / readiness
const errorHandler = require('./middleware/errorMiddleware'); // Global error handler

// Importa tarefas agendadas após a conexão com o banco ser estabelecida
const initCronJobs = require('./services/cronJobs'); // Importa a função de inicialização do cron

// --- Inicialização do Express e Servidor HTTP ---
const app = express();
const server = http.createServer(app); // Cria servidor HTTP a partir do Express app
const _io = initSocketIO(server);       // Inicializa e anexa Socket.IO ao servidor HTTP

// --- Middlewares Essenciais de Segurança ---

// Configuração do cookie-parser para ler cookies
app.use(cookieParser());

// Correlation id (deve vir cedo para que todos os middlewares/logs subsequentes o vejam)
app.use(requestId);

// Configuração das opções de cookie
// O `path` precisa ser compatível tanto com a rota de refresh quanto com logout
// para que `res.clearCookie` no logout efetivamente remova o cookie no browser.
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Apenas HTTPS em produção
    // 'lax' em todos os ambientes: o frontend é servido pela própria aplicação
    // (mesma origem), então não há necessidade de 'none' — e 'lax' protege o
    // refresh token contra CSRF cross-site. Mantido alinhado com config/index.js.
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/api/auth' // Cobre /api/auth/refresh, /api/auth/logout etc.
};

// Torna as opções de cookie disponíveis globalmente
app.set('cookieOptions', cookieOptions);

// Configuração do Helmet para permitir CDNs e inline scripts
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "cdn.socket.io",
                    "https://cdn.socket.io",
                    "code.jquery.com",
                    "cdn.jsdelivr.net",
                    "cdnjs.cloudflare.com",
                    "unpkg.com"
                ],
                scriptSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    "cdn.socket.io",
                    "https://cdn.socket.io",
                    "code.jquery.com",
                    "cdn.jsdelivr.net",
                    "cdnjs.cloudflare.com",
                    "unpkg.com"
                ],
                scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https://*.tile.openstreetmap.org",
                    "http://*.tile.openstreetmap.org",
                    "https://*.openstreetmap.org",
                    "http://*.openstreetmap.org"
                ],
                mediaSrc: [
                    "'self'",
                    "data:",
                    "https://cdn.jsdelivr.net",
                    "https://*.jsdelivr.net"
                ],
                connectSrc: [
                    "'self'",
                    "https://nominatim.openstreetmap.org",
                    "http://nominatim.openstreetmap.org",
                    "https://*.openstreetmap.org",
                    "http://*.openstreetmap.org",
                    "wss://*",
                    "ws://*",
                    "https://receitaws.com.br",
                    "https://brasilapi.com.br",
                    "https://dns.google",
                    "https://cdn.jsdelivr.net",
                    "https://cdnjs.cloudflare.com",
                    "https://unpkg.com",
                    "https://cdn.socket.io"
                ]
            }
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        frameguard: { action: 'deny' }
    })
);

// CORS: Configuração para permitir requisições do frontend
const corsOptions = {
    origin: config.frontendUrl ? config.frontendUrl.split(',') : 'http://localhost:3000',
    credentials: true, // Essencial para enviar/receber cookies seguros
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['set-cookie'],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body Parsers: Habilita leitura de JSON e dados de formulário.
// Limite default 10MB para acomodar imagens em base64 (approvalController).
// Pode ser reduzido via env `BODY_LIMIT` (ex: `1mb`) em deploys que não
// recebem imagens via JSON.
const BODY_LIMIT = process.env.BODY_LIMIT || '10mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Logger HTTP (Morgan)
// Inclui o request-id em todos os formatos para correlação cross-service.
morgan.token('id', (req) => req.id || '-');
const morganFormat =
    process.env.NODE_ENV === 'production'
        ? ':id :remote-addr :method :url :status :res[content-length] - :response-time ms'
        : ':id :method :url :status :response-time ms - :res[content-length]';
app.use(morgan(morganFormat, { stream: logger.stream }));

// Prometheus metrics collection (must come after morgan so we measure the same scope)
app.use(metricsMiddleware);

// Timezone Middleware: Detecta e define o timezone do usuário
app.use(detectTimezone);

// Response Date Formatter: Formata datas nas respostas da API para o timezone do usuário
app.use(require('./middleware/responseDateFormatter'));
// Fotos de perfil legadas eram salvas dentro de public/ — bloqueia o caminho
// para que dados pessoais nunca sejam servidos estaticamente (o endpoint
// autenticado GET /api/user/profile/foto cobre a entrega).
app.use('/user/img/profile', (req, res) => {
    res.status(404).json({ success: false, message: 'Não encontrado.' });
});
app.use(express.static(path.join(__dirname, 'public')));

// Add time service to all requests
app.use((req, res, next) => {
    // Add time service utilities to response locals
    res.locals.formatDate = (date) => date ? new Date(date).toISOString() : null;
    next();
});

// Uploads: fotos de estacionamento são públicas (aparecem nas listagens),
// mas comprovantes PIX e fotos de perfil contêm dados pessoais/financeiros e
// NÃO são servidos estaticamente. Eles são entregues apenas por endpoints
// autenticados: GET /api/user/profile/foto (dono) e
// GET /api/admin/pagamentos/:id/comprovante (admin do estacionamento).
const SENSITIVE_UPLOAD_PATTERN = /^\/(comprovante-|profile\/|profile_images\/)/i;
app.use('/uploads', (req, res, next) => {
    if (SENSITIVE_UPLOAD_PATTERN.test(req.path)) {
        return res.status(404).json({ success: false, message: 'Não encontrado.' });
    }
    next();
}, express.static(path.join(__dirname, 'uploads')));

// Rotas públicas (não requerem autenticação)
app.use('/api/public', approvalRoutes); // Rotas de aprovação de parcerias

// Health checks na raiz para uso por Docker/K8s/uptime monitors (/health, /health/ready)
app.use('/', healthRoutes);

// Prometheus metrics endpoint. Restrict in production: only accessible from
// loopback or from a host providing the configured METRICS_TOKEN bearer.
app.get('/metrics', (req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) return metricsHandler(req, res, next);

    const token = process.env.METRICS_TOKEN;
    const auth = req.get('Authorization') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);

    if (loopback || (token && provided && provided === token)) {
        return metricsHandler(req, res, next);
    }
    return res.status(404).end();
});

// Todas as rotas da API (com prefixo /api)
app.use('/api', apiRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/time', timeRoutes);

// OpenAPI / Swagger UI — gera a spec a partir dos JSDoc das rotas.
// `/api/docs.json` retorna o JSON puro (cacheável). `/api/docs` serve a UI.
// Em produção a UI é desabilitada se DOCS_DISABLED=true.
if (process.env.DOCS_DISABLED !== 'true') {
    try {
        const swaggerUi = require('swagger-ui-express');
        const { buildSpec } = require('./utils/openapi');
        const spec = buildSpec();
        app.get('/api/docs.json', (req, res) => {
            res.set('Cache-Control', 'public, max-age=300');
            res.json(spec);
        });
        app.use(
            '/api/docs',
            swaggerUi.serve,
            swaggerUi.setup(spec, {
                explorer: true,
                customSiteTitle: 'ParkNow API Docs',
            })
        );
        logger.info('[openapi] Swagger UI mounted at /api/docs (spec: /api/docs.json)');
    } catch (err) {
        logger.warn('[openapi] failed to mount Swagger UI', { error: err.message });
    }
} else {
    logger.info('[openapi] DOCS_DISABLED=true, skipping Swagger UI mount');
}

// Rotas de páginas
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/reset-password/:token', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'reset-password.html')); });
app.get('/admin_home/admin-home.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin_home', 'admin-home.html')); });

// Páginas estáticas de retorno do pagamento (sucesso/cancelamento)
app.get('/pagamento-sucesso.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'pagamento-sucesso.html')); });
app.get('/pagamento-cancelado.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'pagamento-cancelado.html')); });

// --- Tratamento de Erros (Último) ---
app.use(errorHandler);

// --- Inicialização ---
async function initializeServer() {
    try {
        // 1. Testar conexão com o banco de dados
        logger.info('Testando conexão com o banco de dados...');
        await testConnection();
        logger.info('✅ Conexão com o banco de dados estabelecida com sucesso!');

        // 2. Inicializar tarefas agendadas
        logger.info('Inicializando tarefas agendadas...');
        try {
            initCronJobs();
            logger.info('✅ Tarefas agendadas inicializadas com sucesso!');
        } catch (error) {
            logger.error('❌ Erro ao inicializar tarefas agendadas:', error);
            throw error; // Propaga o erro para ser capturado pelo catch externo
        }

        // 3. Iniciar o servidor
        const startServer = (port) => {
            server.listen(port)
                .on('listening', () => {
                    logger.info(`🚀 Servidor ParkNow (vFinal+) rodando em http://localhost:${port}`);
                })
                .on('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        logger.warn(`⚠️  Porta ${port} já está em uso. Tentando porta ${port + 1}...`);
                        startServer(port + 1);
                    } else {
                        logger.error('❌ Erro ao iniciar servidor:', err);
                        process.exit(1);
                    }
                });
        };

        startServer(config.port);
    } catch (error) {
        logger.error('❌ Falha na inicialização do servidor:', error);
        process.exit(1);
    }
}

// Inicializar o servidor
initializeServer();

// Inicialização de outros serviços pode ser adicionada aqui

// --- Graceful Shutdown ---
const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

signals.forEach(signal => {
    process.on(signal, async () => {
        logger.warn(`[Server] Sinal ${signal} recebido. Iniciando desligamento gracioso...`);

        // 1. Fechar o servidor HTTP
        server.close(async () => {
            logger.info('[Server] Servidor HTTP fechado.');

            // 2. Fechar a pool de conexões do banco de dados
            try {
                logger.info('[DB] Fechando pool de conexões...');
                await closePool();
                logger.info('[DB] Pool de conexões fechada com sucesso.');
            } catch (error) {
                logger.error('[DB] Erro ao fechar pool de conexões:', error);
            }

            // 3. Encerrar o processo
            logger.info('[Server] Processo encerrado com sucesso.');
            process.exit(0);
        });

        // Forçar encerramento se o desligamento gracioso demorar muito
        const forceShutdown = setTimeout(() => {
            logger.error('[Server] Desligamento forçado após timeout.');
            process.exit(1);
        }, 10000);

        // Limpar o timeout se o desligamento for concluído a tempo
        process.once('exit', () => clearTimeout(forceShutdown));
    });
});

// Lidar com rejeições de promessas não tratadas
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Rejeição de promessa não tratada:', {
        reason,
        promise,
        stack: reason && reason.stack
    });
    if (reason instanceof Error) {
        errorTracker.captureException(reason, { source: 'unhandledRejection' });
    } else {
        errorTracker.captureMessage(String(reason), 'error', { source: 'unhandledRejection' });
    }
    // Não é necessário encerrar o processo aqui, apenas registrar o erro
});

// Lidar com exceções não capturadas
process.on('uncaughtException', (error) => {
    logger.error('Exceção não capturada:', {
        error: error.message,
        stack: error.stack
    });
    errorTracker.captureException(error, { source: 'uncaughtException' });
    // Encerrar o processo após registrar o erro
    process.exit(1);
});
