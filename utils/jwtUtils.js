// utils/jwtUtils.js
// Funções utilitárias para gerar e verificar JSON Web Tokens (JWT).

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid'); // Para gerar IDs únicos (JTI) para blacklist
const config = require('../config'); // Importa configurações (segredos, expiração)
const logger = require('./logger'); // Para logar erros

/**
 * Gera um Access Token JWT assinado.
 * @param {object} payload - Dados a incluir (ex: { userId: 1, type: 'user' }).
 * @returns {string} O Access Token JWT.
 * @throws {Error} Se JWT_SECRET não configurado ou erro na geração.
 */
const generateAccessToken = (payload) => {
    if (!config.jwt.secret) { logger.error("FATAL: JWT_SECRET não configurado ao gerar Access Token."); throw new Error('Configuração de segurança ausente.'); }
    try {
        const jwtid = uuidv4(); // ID único para o token (útil para blacklist)
        logger.debug(`Gerando Access Token com JTI: ${jwtid}`);
        return jwt.sign({ ...payload, tokenType: 'access', jti: jwtid }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
    } catch (error) { logger.error("Erro ao gerar Access Token JWT:", error); throw new Error("Erro interno ao gerar token de acesso."); }
};

/**
 * Gera um Refresh Token JWT assinado.
 * @param {object} payload - Dados a incluir (ex: { userId: 1, type: 'user' }).
 * @returns {string} O Refresh Token JWT.
 * @throws {Error} Se JWT_REFRESH_SECRET não configurado ou erro na geração.
 */
const generateRefreshToken = (payload) => {
    if (!config.jwt.refreshSecret) { logger.error("FATAL: JWT_REFRESH_SECRET não configurado ao gerar Refresh Token."); throw new Error('Configuração de segurança ausente.'); }
    try {
        const jwtid = uuidv4(); // ID único
         logger.debug(`Gerando Refresh Token com JTI: ${jwtid}`);
        return jwt.sign({ ...payload, tokenType: 'refresh', jti: jwtid }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
    } catch (error) { logger.error("Erro ao gerar Refresh Token JWT:", error); throw new Error("Erro interno ao gerar token de atualização."); }
};

/**
 * Verifica a validade de um Access Token JWT.
 * @param {string} token - O Access Token.
 * @returns {object | null} Payload decodificado se válido e tipo 'access', ou null.
 */
const verifyAccessToken = (token) => {
    if (!config.jwt.secret) { logger.error('Verify Access sem JWT_SECRET.'); return null; }
    try {
        const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }); // Especifica algoritmo
        // Verifica tipo esperado
        if (decoded.tokenType !== 'access') { logger.warn(`[JWT Verify] Token não é do tipo 'access'. Tipo: ${decoded.tokenType}`); return null; }
        return decoded; // Retorna payload completo (inclui iat, exp, jti)
    } catch (err) {
        // Loga erro apenas se não for expiração (que é normal)
        if (err.name !== 'TokenExpiredError') logger.warn(`[JWT Verify Access] Erro: ${err.message}`);
        return null; // Inválido ou expirado
    }
};

/**
 * Verifica a validade de um Refresh Token JWT.
 * @param {string} token - O Refresh Token.
 * @returns {object | null} Payload decodificado se válido e tipo 'refresh', ou null.
 */
const verifyRefreshToken = (token) => {
    if (!config.jwt.refreshSecret) { logger.error('Verify Refresh sem JWT_REFRESH_SECRET.'); return null; }
    try {
        const decoded = jwt.verify(token, config.jwt.refreshSecret, { algorithms: ['HS256'] });
         if (decoded.tokenType !== 'refresh') { logger.warn(`[JWT Verify] Token não é do tipo 'refresh'. Tipo: ${decoded.tokenType}`); return null; }
        return decoded;
    } catch (err) {
         if (err.name !== 'TokenExpiredError') logger.warn(`[JWT Verify Refresh] Erro: ${err.message}`);
        return null; // Inválido ou expirado
    }
};

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken };