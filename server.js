// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');                     // Segurança HTTP Headers
const detectTimezone = require('./middleware/detectTimezone');  // Timezone detection middleware
const rateLimit = require('express-rate-limit');     // Limita requisições (Rate Limiting)
const cookieParser = require('cookie-parser');         // Para ler/escrever cookies (refresh token)
const http = require('http');                          // Módulo HTTP nativo do Node.js (para Socket.IO)
const morgan = require('morgan');                      // Middleware para log HTTP
const config = require('./config');                  // Carrega configurações da aplicação (inclui .env)
const logger = require('./utils/logger');              // Logger customizado (Winston)
const { initSocketIO } = require('./services/socketService'); // Inicializador do Socket.IO
const { testConnection, closePool } = require('./utils/dbUtils'); // Utilitário de conexão com o banco de dados

// Import routes
const apiRoutes = require('./routes');                 // Main API router (/api/*)
const approvalRoutes = require('./routes/approvalRoutes'); // Partner approval routes
const timeRoutes = require('./routes/timeRoutes');     // Time service routes
const errorHandler = require('./middleware/errorMiddleware'); // Global error handler

// Importa tarefas agendadas após a conexão com o banco ser estabelecida
const initCronJobs = require('./services/cronJobs'); // Importa a função de inicialização do cron

// --- Inicialização do Express e Servidor HTTP ---
const app = express();
const server = http.createServer(app); // Cria servidor HTTP a partir do Express app
const io = initSocketIO(server);       // Inicializa e anexa Socket.IO ao servidor HTTP

// --- Middlewares Essenciais de Segurança ---

// Configuração do cookie-parser para ler cookies
app.use(cookieParser());

// Configuração das opções de cookie
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Apenas HTTPS em produção
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Para cross-site em produção
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/api/auth/refresh-token' // Apenas acessível pela rota de refresh
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
                    "'unsafe-eval'",
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

// Body Parsers: Habilita leitura de JSON e dados de formulário
// Aumentado para 10MB para suportar upload de imagens em base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger HTTP (Morgan)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', { stream: logger.stream }));

// Timezone Middleware: Detecta e define o timezone do usuário
app.use(detectTimezone);

// Response Date Formatter: Formata datas nas respostas da API para o timezone do usuário
app.use(require('./middleware/responseDateFormatter'));
app.use(express.static(path.join(__dirname, 'public')));

// Add time service to all requests
app.use((req, res, next) => {
    // Add time service utilities to response locals
    res.locals.formatDate = (date) => date ? new Date(date).toISOString() : null;
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas públicas (não requerem autenticação)
app.use('/api/public', approvalRoutes); // Rotas de aprovação de parcerias

// Todas as rotas da API (com prefixo /api)
app.use('/api', apiRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/time', timeRoutes);

// Rotas de webhooks do ASAAS (configuradas no apiRoutes)
// app.use('/api/webhooks', webhookRoutes);

// Rotas de páginas
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/reset-password/:token', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'reset-password.html')); });
app.get('/admin_home/admin-home.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'admin_home', 'admin-home.html')); });

// Rotas de retorno do pagamento ASAAS
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
        stack: reason.stack
    });
    // Não é necessário encerrar o processo aqui, apenas registrar o erro
});

// Lidar com exceções não capturadas
process.on('uncaughtException', (error) => {
    logger.error('Exceção não capturada:', {
        error: error.message,
        stack: error.stack
    });
    // Encerrar o processo após registrar o erro
    process.exit(1);
});
