// utils/zxcvbnUtil.js
// Wrapper simples para a biblioteca zxcvbn de força de senha.

const zxcvbn = require('zxcvbn');
const logger = require('./logger'); // Para logar pontuação (opcional)

/**
 * Verifica a força de uma senha usando zxcvbn.
 * @param {string} password - A senha a ser verificada.
 * @param {Array<string>} [userInputs=[]] - Array opcional de strings relacionadas ao usuário (nome, email, etc.) para verificar se a senha as utiliza.
 * @returns {object} O objeto de resultado do zxcvbn, incluindo 'score' (0-4) e 'feedback'.
 */
const checkPasswordStrength = (password, userInputs = []) => {
    if (!password || typeof password !== 'string') {
        // Retorna um resultado padrão de falha se a senha for inválida
        return {
            score: 0,
            feedback: {
                warning: 'Senha inválida fornecida.',
                suggestions: ['Use uma senha válida.'],
            },
        };
    }
    try {
        const result = zxcvbn(password, userInputs);
        logger.debug(`[Password Strength] Score Zxcvbn: ${result.score}`);
        return result;
    } catch (error) {
        logger.error("[Password Strength] Erro ao calcular força da senha com zxcvbn:", error);
        // Retorna falha em caso de erro interno da biblioteca
        return {
            score: 0,
            feedback: {
                warning: 'Erro ao verificar a força da senha.',
                suggestions: [],
            },
            error: true // Flag indicando erro
        };
    }
};

module.exports = {
    checkPasswordStrength
};