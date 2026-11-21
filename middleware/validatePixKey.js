const { AppError } = require('../utils/AppError');
const { validarCNPJ } = require('../utils/documentos');

/**
 * Middleware para validar se a chave PIX é um CNPJ válido
 */
const validatePixKey = (req, res, next) => {
  const { chave_pix, tipo_chave_pix } = req.body;

  // Verifica se é uma chave PIX do tipo CNPJ
  if (tipo_chave_pix === 'CNPJ') {
    // Remove caracteres não numéricos
    const cnpjLimpo = String(chave_pix || '').replace(/[^\d]/g, '');
    
    // Verifica se o CNPJ é válido
    if (!validarCNPJ(cnpjLimpo)) {
      return next(new AppError('CNPJ inválido para a chave PIX', 400));
    }
    
    // Atualiza o valor da chave PIX com apenas números
    req.body.chave_pix = cnpjLimpo;
  }

  next();
};

module.exports = validatePixKey;
