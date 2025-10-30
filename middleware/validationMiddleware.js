// middleware/validationMiddleware.js
// Middleware auxiliar para lidar com os resultados da validação do express-validator.

const { validationResult } = require('express-validator');
const { ValidationError } = require('../utils/AppError'); // Importa erro customizado
const logger = require('../utils/logger'); // Para logar erros de validação

/**
 * Middleware para verificar e lidar com erros de validação gerados pelo express-validator.
 * Deve ser usado *depois* das cadeias de validação (check(), body(), etc.) nas definições de rota.
 * Se houver erros, cria um `ValidationError` (que é um `AppError` com status 422)
 * e passa para o próximo middleware (geralmente o `errorHandler`).
 * @param {object} req - Objeto da requisição Express.
 * @param {object} res - Objeto da resposta Express.
 * @param {function} next - Função para chamar o próximo middleware/rota.
 */
const handleValidationErrors = (req, res, next) => {
    // Obtém os resultados da validação da requisição atual
    const errors = validationResult(req);

    // Verifica se há erros de validação
    if (!errors.isEmpty()) {
        // Loga os erros de validação para depuração no servidor
        logger.warn(`[Validation] Erros de validação na rota ${req.method} ${req.originalUrl}:`, errors.array());
        
        // Loga o corpo da requisição para depuração
        logger.debug(`[Validation] Corpo da requisição: ${JSON.stringify(req.body)}`);

        // Cria e passa um erro de validação customizado para o errorHandler
        // O errorHandler formatará a resposta JSON com status 422 e os erros.
        return next(new ValidationError(errors.array(), 'Um ou mais campos são inválidos.'));
    }

    // Se não houver erros de validação, simplesmente passa para o próximo middleware ou controller
    next();
};

module.exports = {
    handleValidationErrors
};