const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../utils/logger');

class EmailRateLimiter {
    constructor() {
        logger.info('Inicializando rate limiter em memória');
        this.setupLimiters();
    }

    setupLimiters() {
        // Configura o limitador de validação de e-mail (por IP)
        this.emailValidationLimiter = new RateLimiterMemory({
            points: 100, // 100 requisições
            duration: 3600, // por hora
            blockDuration: 3600, // bloquear por 1 hora se exceder
            inMemoryBlockOnConsumed: 101, // Bloquear na memória para evitar sobrecarga
            inMemoryBlockDuration: 60 // Bloqueio em memória por 60 segundos
        });

        // Configura o limitador de tentativas por e-mail
        this.emailAttemptLimiter = new RateLimiterMemory({
            points: 5, // 5 tentativas
            duration: 86400, // por dia
            blockDuration: 86400, // bloquear por 24 horas se exceder
            inMemoryBlockOnConsumed: 6, // Bloquear na memória após 6 tentativas
            inMemoryBlockDuration: 3600 // Bloqueio em memória por 1 hora
        });

        logger.info('Rate limiter em memória configurado com sucesso');
    }

    async checkRateLimit(ip, email) {
        try {
            const [ipResult, emailResult] = await Promise.all([
                this.emailValidationLimiter.consume(ip),
                this.emailAttemptLimiter.consume(email.toLowerCase())
            ]);

            return {
                allowed: true,
                headers: {
                    'X-RateLimit-IP-Remaining': ipResult.remainingPoints,
                    'X-RateLimit-IP-Reset': Math.ceil(ipResult.msBeforeNext / 1000),
                    'X-RateLimit-Email-Remaining': emailResult.remainingPoints,
                    'X-RateLimit-Email-Reset': Math.ceil(emailResult.msBeforeNext / 1000)
                }
            };
        } catch (error) {
            if (error instanceof Error) {
                // Erro no rate limiter
                logger.error('Erro no rate limiter:', error);
                return { allowed: true }; // Fail open em caso de erro
            }

            // Rate limit excedido
            const retryAfter = Math.ceil(error.msBeforeNext / 1000);
            return {
                allowed: false,
                retryAfter,
                error: error.consumedPoints ? 'rate_limit_exceeded' : 'too_many_requests',
                message: error.consumedPoints 
                    ? 'Muitas tentativas de validação. Por favor, tente novamente mais tarde.'
                    : 'Muitas requisições. Por favor, diminua a velocidade.'
            };
        }
    }

    // Middleware para uso em rotas Express
    middleware() {
        return async (req, res, next) => {
            const ip = req.ip || req.connection.remoteAddress;
            const email = req.body.email;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'E-mail não fornecido'
                });
            }

            const result = await this.checkRateLimit(ip, email);
            
            if (!result.allowed) {
                res.set({
                    'Retry-After': result.retryAfter,
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': result.retryAfter
                });

                return res.status(429).json({
                    success: false,
                    error: result.error,
                    message: result.message,
                    retryAfter: result.retryAfter
                });
            }

            // Adiciona cabeçalhos de rate limit à resposta
            if (result.headers) {
                Object.entries(result.headers).forEach(([key, value]) => {
                    res.set(key, value.toString());
                });
            }

            next();
        };
    }
}

module.exports = new EmailRateLimiter();
