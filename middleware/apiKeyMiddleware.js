const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

/**
 * Middleware para validar a chave de API nas requisições (endpoints de cron).
 *
 * Fail-closed: se CRON_API_KEY não estiver configurada no ambiente, o endpoint
 * é negado (503) em vez de aceitar uma chave padrão previsível.
 * A chave é aceita apenas via header `x-api-key` (nunca via query string,
 * para não vazar em logs de acesso/proxies).
 *
 * @param {Object} req - Objeto de requisição
 * @param {Object} res - Objeto de resposta
 * @param {Function} next - Próximo middleware
 */
const validateApiKey = (req, res, next) => {
    try {
        const configuredKey = process.env.CRON_API_KEY;
        if (!configuredKey) {
            logger.error('CRON_API_KEY não configurada — endpoint de cron desabilitado', {
                path: req.path,
                method: req.method,
            });
            throw new AppError('Endpoint indisponível: CRON_API_KEY não configurada.', 503);
        }

        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            logger.warn('Tentativa de acesso sem chave de API', {
                path: req.path,
                method: req.method,
                ip: req.ip
            });
            throw new AppError('Chave de API não fornecida', 401);
        }

        // Comparação em tempo constante (anti timing attack). Hashear ambos os
        // lados garante buffers de mesmo tamanho para o timingSafeEqual.
        const providedHash = crypto.createHash('sha256').update(String(apiKey)).digest();
        const expectedHash = crypto.createHash('sha256').update(configuredKey).digest();
        if (!crypto.timingSafeEqual(providedHash, expectedHash)) {
            logger.warn('Tentativa de acesso com chave de API inválida', {
                path: req.path,
                method: req.method,
                ip: req.ip
            });
            throw new AppError('Chave de API inválida', 403);
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateApiKey
};
