// middleware/authMiddleware.js
const jwtUtils = require('../utils/jwtUtils');
const { AuthenticationError } = require('../utils/AppError');
const logger = require('../utils/logger');
const { validateApiKey } = require('./apiKeyMiddleware');

// Cache curtíssimo dos dados do usuário autenticado: evita 1 SELECT por
// requisição sem mudar a semântica de forma relevante (um usuário removido
// continua válido por no máximo USER_CACHE_TTL_MS após a remoção; o token JWT
// continua sendo verificado criptograficamente em TODA requisição).
const USER_CACHE_TTL_MS = parseInt(process.env.AUTH_USER_CACHE_TTL_MS || '30000', 10);
const USER_CACHE_MAX = 1000;
const userCache = new Map(); // userId -> { user, expiresAt }

function getCachedUser(userId) {
    const entry = userCache.get(userId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        userCache.delete(userId);
        return null;
    }
    return entry.user;
}

function setCachedUser(userId, user) {
    if (USER_CACHE_TTL_MS <= 0) return; // cache desligável via env
    if (userCache.size >= USER_CACHE_MAX) {
        // Descarta a entrada mais antiga (Map preserva ordem de inserção)
        const oldest = userCache.keys().next().value;
        userCache.delete(oldest);
    }
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

const protectUser = async (req, res, next) => {
    let token; const authHeader = req.headers.authorization; const clientIp = req.ip || 'IP N/A';
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            token = authHeader.split(' ')[1]; const decoded = jwtUtils.verifyAccessToken(token);
            if (!decoded || !decoded.userId || decoded.type !== 'user') { logger.warn(`[Auth User] Acesso negado: Token inválido/tipo incorreto. IP: ${clientIp}`); return next(new AuthenticationError('Token inválido ou não autorizado.')); }

            let user = getCachedUser(decoded.userId);
            if (!user) {
                // Buscar dados do usuário do banco para incluir email, CPF e telefone
                const db = require('../config/database');
                const userResult = await db.query('SELECT id, nome, email, cpf, telefone FROM usuarios WHERE id = $1', [decoded.userId]);

                if (!userResult.rows || userResult.rows.length === 0) {
                    logger.warn(`[Auth User] Usuário não encontrado: ${decoded.userId}`);
                    return next(new AuthenticationError('Usuário não encontrado.'));
                }

                user = {
                    id: userResult.rows[0].id,
                    nome: userResult.rows[0].nome,
                    email: userResult.rows[0].email,
                    cpf: userResult.rows[0].cpf,
                    telefone: userResult.rows[0].telefone
                };
                setCachedUser(decoded.userId, user);
            }

            req.user = user;

            logger.debug(`[Auth User] Acesso permitido User ID: ${decoded.userId}. Rota: ${req.originalUrl}`); next();
        } catch (error) { logger.error('[Auth User] Erro inesperado auth:', error); return next(new AuthenticationError('Erro na autenticação.')); }
    } else { logger.warn(`[Auth User] Acesso negado: Token não fornecido. IP: ${clientIp}`); return next(new AuthenticationError('Token não fornecido.')); }
};

// Invalida a entrada de cache de um usuário (chamar após updates de perfil).
const invalidateUserCache = (userId) => userCache.delete(userId);

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
    validateApiKey,
    invalidateUserCache
};