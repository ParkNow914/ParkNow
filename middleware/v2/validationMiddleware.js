const { validationResult } = require('express-validator');
const { AppError } = require('../../utils/AppError');

/**
 * Middleware para validar os resultados da validação do express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // Mapeia os erros para um formato mais amigável
    const formattedErrors = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
    }));
    
    return next(
      new AppError('Erro de validação', 400, {
        errors: formattedErrors,
      })
    );
  }
  
  next();
};

/**
 * Função para validar IDs de parâmetros de rota
 */
const validateId = (req, res, next) => {
  const { id } = req.params;
  
  if (!id || isNaN(parseInt(id, 10))) {
    return next(new AppError('ID inválido', 400));
  }
  
  next();
};

module.exports = {
  validate,
  validateId,
};
