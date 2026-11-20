// utils/tokenUtils.js
// Utilitários para gerar tokens seguros (ex: reset de senha) usando crypto nativo.

const crypto = require('crypto');
const logger = require('./logger'); // Para logar erros

/**
 * Gera um token aleatório seguro em formato hexadecimal.
 * Recomendado para tokens de uso único como reset de senha ou verificação de email.
 * @param {number} [length=32] - O comprimento em bytes dos dados aleatórios (padrão 32 bytes -> 64 caracteres hex).
 * @returns {string} O token hexadecimal.
 */
const generateSecureToken = (length = 32) => {
    try {
        // Gera bytes aleatórios criptograficamente seguros
        const buffer = crypto.randomBytes(length);
        // Converte para string hexadecimal
        return buffer.toString('hex');
    } catch (error) {
        // Falha fechado: um token previsível (Math.random) seria pior que erro.
        logger.error("[Token Utils] Erro CRÍTICO ao gerar token seguro com crypto.randomBytes:", error);
        throw new Error('Não foi possível gerar um token seguro.');
    }
};

/**
 * Cria um hash de um token usando SHA-256 (ou outro algoritmo de hash seguro).
 * Usado para armazenar uma representação do token no banco de dados de forma segura.
 * @param {string} token - O token original em texto plano.
 * @returns {string} O hash SHA-256 do token em formato hexadecimal.
 * @throws {Error} Se o token não for uma string válida ou ocorrer erro no hashing.
 */
const hashToken = (token) => {
    if (typeof token !== 'string' || token.length === 0) {
         logger.error("[Token Utils] Tentativa de hashear token inválido:", typeof token);
        throw new Error("Token inválido fornecido para hashing.");
    }
    try {
        // Cria um objeto hash SHA-256
        return crypto.createHash('sha256')
                     .update(token)        // Adiciona o token ao hash
                     .digest('hex');       // Gera o hash final em hexadecimal
    } catch (error) {
        logger.error("[Token Utils] Erro ao criar hash SHA-256 do token:", error);
        throw new Error("Erro interno ao processar token para hashing.");
    }
};

/**
 * Hash do refresh token para guardar no banco.
 * SHA-256 (e não bcrypt): o bcrypt só considera os 72 primeiros bytes, e todo
 * refresh JWT do mesmo usuário começa igual nesses 72 bytes — com bcrypt, um
 * token antigo continuava valendo depois da rotação.
 * O prefixo `sha256:` distingue do formato antigo ($2b$...), que deixa de ser
 * aceito (sessões antigas precisam logar de novo).
 */
const hashRefreshToken = (token) => `sha256:${hashToken(token)}`;

/**
 * Compara o refresh token recebido com o hash salvo, em tempo constante.
 * @returns {boolean}
 */
const verifyRefreshTokenAgainstHash = (token, storedHash) => {
    if (typeof token !== 'string' || !token || typeof storedHash !== 'string' || !storedHash.startsWith('sha256:')) {
        return false;
    }
    const esperado = Buffer.from(storedHash, 'utf8');
    const recebido = Buffer.from(hashRefreshToken(token), 'utf8');
    return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
};

// Exporta as funções utilitárias
module.exports = {
    generateSecureToken,
    hashToken,
    hashRefreshToken,
    verifyRefreshTokenAgainstHash
};