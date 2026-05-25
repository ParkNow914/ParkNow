// utils/openapi.js
//
// Generates the OpenAPI 3.0 specification for the ParkNow API.
//
// We use swagger-jsdoc to scan our route files for `@swagger` JSDoc blocks
// (those blocks already exist on most payment / reservation / cron routes).
// The spec is rebuilt at process start; in production it's safe to cache and
// serve the resulting JSON unchanged.

const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config');

const ROOT = path.resolve(__dirname, '..');

const definition = {
    openapi: '3.0.3',
    info: {
        title: 'ParkNow API',
        version: process.env.npm_package_version || '1.0.0',
        description:
            'API REST do ParkNow — sistema de gerenciamento de estacionamentos, reservas e pagamentos. ' +
            'A documentação é gerada automaticamente a partir dos blocos JSDoc `@swagger` espalhados pelos ' +
            'arquivos em `routes/` e `controllers/`.',
        contact: {
            name: 'ParkNow914',
            url: 'https://github.com/ParkNow914/ParkNow',
        },
        license: { name: 'Proprietary' },
    },
    servers: [
        {
            url: config.frontendUrl?.split(',')?.[0] || 'http://localhost:3000',
            description: 'Servidor configurado em FRONTEND_URL',
        },
        { url: 'http://localhost:3000', description: 'Desenvolvimento local' },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'JWT emitido por `POST /api/auth/login` ou `POST /api/auth/admin/login`.',
            },
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'refreshToken',
                description: 'Cookie httpOnly contendo o refresh token; usado por /api/auth/refresh-token.',
            },
        },
        parameters: {
            IdempotencyKey: {
                name: 'Idempotency-Key',
                in: 'header',
                required: false,
                schema: { type: 'string', minLength: 8, maxLength: 255 },
                description:
                    'Chave opaca opcional para idempotência. Retries com a mesma chave retornam a mesma ' +
                    'resposta (header `Idempotent-Replay: true`).',
            },
        },
        responses: {
            TooManyRequests: {
                description: 'Limite de taxa excedido',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean', example: false },
                                error: { type: 'string', example: 'too_many_requests' },
                            },
                        },
                    },
                },
            },
            Unauthorized: {
                description: 'Não autenticado ou token inválido',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean', example: false },
                                error: { type: 'string', example: 'unauthorized' },
                            },
                        },
                    },
                },
            },
        },
        schemas: {
            ErrorResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string' },
                    message: { type: 'string' },
                },
            },
        },
    },
    tags: [
        { name: 'Auth', description: 'Autenticação de usuários e administradores' },
        { name: 'Reservas', description: 'Criação e gestão de reservas' },
        { name: 'Reservas com Pagamento', description: 'Fluxo de reserva integrado a pagamentos' },
        { name: 'Pagamentos', description: 'Operações financeiras (PIX manual, sem gateway pago)' },
        { name: 'Pagamento PIX', description: 'Operações específicas do PIX' },
        { name: 'Estacionamentos', description: 'Listagem e gestão de estacionamentos' },
        { name: 'Health', description: 'Endpoints de liveness/readiness' },
        { name: 'Observability', description: 'Métricas e diagnóstico' },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Liveness probe',
                responses: { 200: { description: 'Servidor responde' } },
            },
        },
        '/health/ready': {
            get: {
                tags: ['Health'],
                summary: 'Readiness probe (inclui SELECT 1 contra o Postgres)',
                responses: {
                    200: { description: 'Pronto' },
                    503: { description: 'Banco indisponível' },
                },
            },
        },
        '/metrics': {
            get: {
                tags: ['Observability'],
                summary: 'Métricas Prometheus',
                description:
                    'Em produção exige loopback ou `Authorization: Bearer $METRICS_TOKEN`; ' +
                    'em desenvolvimento é público. Retorna texto Prometheus exposition format.',
                responses: {
                    200: {
                        description: 'Métricas',
                        content: { 'text/plain': { schema: { type: 'string' } } },
                    },
                    404: { description: 'Acesso negado (mascarado como 404 em produção)' },
                },
            },
        },
    },
};

const options = {
    definition,
    // swagger-jsdoc scans these files for `@swagger` blocks.
    apis: [
        path.join(ROOT, 'routes/**/*.js'),
        path.join(ROOT, 'controllers/**/*.js'),
    ],
};

let cachedSpec = null;

function buildSpec() {
    if (cachedSpec) return cachedSpec;
    cachedSpec = swaggerJsdoc(options);
    return cachedSpec;
}

module.exports = { buildSpec };
