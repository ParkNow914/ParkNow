const { validationResult, body, param } = require('express-validator');
const { AppError } = require('../utils/errors');
const { validate: isUuid } = require('uuid');

/**
 * Valida os dados de pagamento para split
 */
const validatePayment = [
  // Validar campos básicos
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Valor deve ser maior que zero')
    .toFloat(),
    
  body('description')
    .isString()
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage('Descrição deve ter entre 3 e 255 caracteres'),
    
  body('paymentMethod')
    .isIn(['pix', 'credit_card', 'debit_card'])
    .withMessage('Método de pagamento inválido'),
    
  body('installments')
    .optional({ nullable: true })
    .isInt({ min: 1, max: 12 })
    .withMessage('Número de parcelas deve estar entre 1 e 12')
    .toInt(),
    
  // Validação do pagador
  body('payer')
    .isObject()
    .withMessage('Dados do pagador são obrigatórios'),
    
  body('payer.email')
    .isEmail()
    .normalizeEmail()
    .withMessage('E-mail do pagador inválido'),
    
  body('payer.firstName')
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nome do pagador deve ter entre 2 e 50 caracteres'),
    
  body('payer.lastName')
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Sobrenome do pagador deve ter entre 2 e 100 caracteres'),
    
  body('payer.identification')
    .isObject()
    .withMessage('Dados de identificação são obrigatórios'),
    
  body('payer.identification.type')
    .isIn(['CPF', 'CNPJ'])
    .withMessage('Tipo de documento inválido (use CPF ou CNPJ)'),
    
  body('payer.identification.number')
    .isString()
    .trim()
    .matches(/^\d{11,14}$/)
    .withMessage('Número de documento inválido (use apenas números)'),
    
  // Validação do cartão (se aplicável)
  body('card')
    .if(body('paymentMethod').isIn(['credit_card', 'debit_card']))
    .isObject()
    .withMessage('Dados do cartão são obrigatórios para pagamento com cartão')
    .bail()
    .custom((value, { req }) => {
      if (!value.token) {
        throw new Error('Token do cartão é obrigatório');
      }
      if (req.body.paymentMethod === 'credit_card' && !value.issuerId) {
        throw new Error('Emissor do cartão é obrigatório para cartão de crédito');
      }
      return true;
    }),
    
  // Validação do estacionamento
  body('parkingId')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('ID do estacionamento é obrigatório'),
    
  body('parkingReceiverId')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('ID do recebedor do estacionamento é obrigatório'),
    
  body('externalReference')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Referência externa deve ter no máximo 255 caracteres'),
    
  // Middleware para processar erros de validação
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.path,
          message: err.msg
        })),
        message: 'Erro de validação nos dados do pagamento'
      });
    }
    
    // Normaliza os dados após validação
    const { payer } = req.body;
    if (payer) {
      // Remove espaços extras e formata o documento
      if (payer.identification && payer.identification.number) {
        payer.identification.number = payer.identification.number.replace(/\D/g, '');
      }
    }
    
    next();
  }
];

/**
 * Valida o ID do pagamento
 */
const validatePaymentId = [
  param('id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('ID do pagamento é obrigatório')
    .bail()
    .custom(value => {
      if (!isUuid(value)) {
        throw new Error('ID do pagamento inválido');
      }
      return true;
    }),
    
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
 })),
        message: 'ID de pagamento inválido'
      });
    }
    next();
  }
];

/**
 * Valida o webhook do Mercado Pago
 */
const validateWebhook = [
  // Verifica se há um cabeçalho de assinatura
  (req, res, next) => {
    const signature = req.headers['x-signature'] || req.headers['x-signature-sha256'];
    
    if (!signature) {
      return res.status(401).json({
        success: false,
        message: 'Assinatura não fornecida'
      });
    }
    
    // Adiciona a assinatura ao objeto de requisição para uso posterior
    req.mpSignature = signature;
    next();
  },
  
  // Valida o corpo da requisição
  body()
    .isObject()
    .withMessage('Corpo da requisição inválido'),
    
  body('type')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Tipo de notificação não especificado'),
    
  body('data.id')
    .if(body('type').equals('payment'))
    .isString()
    .trim()
    .notEmpty()
    .withMessage('ID do pagamento não especificado'),
    
  // Middleware para processar erros de validação
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg
        })),
        message: 'Erro de validação no webhook'
      });
    }
    next();
  }
];

module.exports = {
  validatePayment,
  validatePaymentId,
  validateWebhook
};
