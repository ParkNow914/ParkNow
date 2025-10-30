// utils/passwordUtils.js
// Funções utilitárias para hashing e verificação de senhas usando Argon2.

const argon2 = require('argon2');
const logger = require('./logger'); // Importa logger

/**
 * Gera o hash de uma senha usando Argon2id (recomendado).
 * @param {string} password - A senha em texto plano a ser hasheada.
 * @returns {Promise<string>} Uma Promise que resolve com o hash da senha.
 * @throws {Error} Lança um erro se o hashing falhar.
 */
const hashPassword = async (password) => {
    if (!password || typeof password !== 'string') {
        throw new Error("Senha inválida fornecida para hashing.");
    }
    // Opções padrão do Argon2 são geralmente um bom equilíbrio segurança/performance
    const options = { type: argon2.argon2id };
    try {
        const hash = await argon2.hash(password, options);
        logger.debug('[Password] Hash Argon2id gerado com sucesso.');
        return hash;
    } catch (err) {
        logger.error("[Password] Erro crítico ao gerar hash Argon2id:", err);
        throw new Error("Erro interno ao processar a senha."); // Não expor detalhes
    }
};

/**
 * Compara uma senha em texto plano com um hash Argon2 existente.
 * @param {string} hashedPassword - O hash da senha armazenado no banco de dados.
 * @param {string} plainPassword - A senha em texto plano fornecida pelo usuário.
 * @returns {Promise<boolean>} Uma Promise que resolve com true se a senha corresponder, false caso contrário.
 */
const comparePassword = async (hashedPassword, plainPassword) => {
    // Verifica se ambos os argumentos são strings não vazias
    if (!hashedPassword || !plainPassword || typeof hashedPassword !== 'string' || typeof plainPassword !== 'string') {
        logger.warn('[Password] Tentativa de comparar senha/hash inválidos/nulos.');
        return false;
    }
    try {
        // argon2.verify faz a comparação segura
        const isMatch = await argon2.verify(hashedPassword, plainPassword);
        logger.debug(`[Password] Resultado da verificação Argon2id: ${isMatch}`);
        return isMatch;
    } catch (err) {
        // Erros aqui geralmente indicam um hash malformado ou incompatível
        logger.error("[Password] Erro ao verificar senha com Argon2 (hash inválido ou incompatível?):", err.message);
        // Retorna false por segurança em caso de erro
        return false;
    }
};

// Exporta as funções
module.exports = {
    hashPassword,
    comparePassword
};