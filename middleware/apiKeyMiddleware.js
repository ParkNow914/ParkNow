const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

/**
 * Middleware para validar a chave de API nas requisições
 * @param {Object} req - Objeto de requisição
 * @param {Object} res - Objeto de resposta
 * @param {Function} next - Próximo middleware
 */
const validateApiKey = (req, res, next) => {
    try {
        // Obtém a chave de API do cabeçalho ou da query string
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        // Verifica se a chave de API foi fornecida
        if (!apiKey) {
            logger.warn('Tentativa de acesso sem chave de API', {
                path: req.path,
                method: req.method,
                ip: req.ip
            });
            throw new AppError('Chave de API não fornecida', 401);
        }
        
        // Verifica se a chave de API é válida
        const validApiKey = process.env.CRON_API_KEY || 'default-secure-key';
        if (apiKey !== validApiKey) {
            logger.warn('Tentativa de acesso com chave de API inválida', {
                path: req.path,
                method: req.method,
                ip: req.ip,
                providedKey: apiKey
            });
            throw new AppError('Chave de API inválida', 403);
        }
        
        // Chave de API válida, prossegue para o próximo middleware
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateApiKey
};
