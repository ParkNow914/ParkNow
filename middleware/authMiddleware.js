// middleware/authMiddleware.js
const jwtUtils = require('../utils/jwtUtils');
const { AuthenticationError } = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateApiKey } = require('./apiKeyMiddleware');

const protectUser = async (req, res, next) => {
    let token; const authHeader = req.headers.authorization; const clientIp = req.ip || 'IP N/A';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            token = authHeader.split(' ')[1]; const decoded = jwtUtils.verifyAccessToken(token);
            if (!decoded || !decoded.userId || decoded.type !== 'user') { logger.warn(`[Auth User] Acesso negado: Token inválido/tipo incorreto. IP: ${clientIp}`); return next(new AuthenticationError('Token inválido ou não autorizado.')); }
            req.user = { id: decoded.userId }; logger.debug(`[Auth User] Acesso permitido User ID: ${decoded.userId}. Rota: ${req.originalUrl}`); next();
        } catch (error) { logger.error('[Auth User] Erro inesperado auth:', error); return next(new AuthenticationError('Erro na autenticação.')); }
    } else { logger.warn(`[Auth User] Acesso negado: Token não fornecido. IP: ${clientIp}`); return next(new AuthenticationError('Token não fornecido.')); }
};

const protectAdmin = async (req, res, next) => {
    let token; const authHeader = req.headers.authorization; const clientIp = req.ip || 'IP N/A';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            token = authHeader.split(' ')[1]; const decoded = jwtUtils.verifyAccessToken(token);
            if (!decoded || !decoded.adminId || decoded.type !== 'admin') { logger.warn(`[Auth Admin] Acesso negado: Token inválido/tipo incorreto. IP: ${clientIp}`); return next(new AuthenticationError('Token inválido ou não autorizado.')); }
            req.admin = { id: decoded.adminId }; logger.debug(`[Auth Admin] Acesso permitido Admin ID: ${decoded.adminId}. Rota: ${req.originalUrl}`); next();
        } catch (error) { logger.error('[Auth Admin] Erro inesperado auth:', error); return next(new AuthenticationError('Erro na autenticação.')); }
    } else { logger.warn(`[Auth Admin] Acesso negado: Token não fornecido. IP: ${clientIp}`); return next(new AuthenticationError('Token não fornecido.')); }
};
module.exports = { 
    protectUser, 
    protectAdmin, 
    validateApiKey 
};