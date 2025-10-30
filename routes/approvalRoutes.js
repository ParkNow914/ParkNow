// routes/approvalRoutes.js
// Define as rotas para aprovação de solicitações de parceria via token

const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validationMiddleware');
const { partnerApprovalLimiter } = require('../middleware/rateLimiter');
const approvalController = require('../controllers/approvalController');
const logger = require('../utils/logger');

// Middleware para logar tentativas de acesso
const logApprovalAttempt = (req, res, next) => {
  logger.info('Tentativa de acesso a rota de aprovação', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    token: req.params.token ? 'present' : 'missing',
    query: req.query
  });
  next();
};

// Middleware para validar parâmetros de consulta opcionais
const validateQueryParams = [
  query('ref')
    .optional()
    .trim()
    .isString()
    .withMessage('Parâmetro de referência inválido')
    .isLength({ max: 100 })
    .withMessage('Referência muito longa (max 100 caracteres)'),
  handleValidationErrors
];

/**
 * @route   GET /api/public/approve-partner/:token
 * @desc    Aprova automaticamente uma solicitação de parceria via token
 * @access  Public (acessado via link de email)
 */
router.get('/approve-partner/:token', [
  // Validação do token
  param('token')
    .trim()
    .isHexadecimal()
    .withMessage('Token deve conter apenas caracteres hexadecimais')
    .isLength({ min: 64, max: 64 })
    .withMessage('Token deve ter exatamente 64 caracteres'),
  // Validação de parâmetros de consulta
  ...validateQueryParams,
  // Middleware de tratamento de erros
  handleValidationErrors,
  // Rate limiting
  partnerApprovalLimiter,
  // Log de tentativas
  logApprovalAttempt
], approvalController.approvePartner);

/**
 * @route   GET /api/public/reject-partner/:token
 * @desc    Rejeita uma solicitação de parceria via token
 * @access  Public (acessado via link de email)
 */
router.get('/reject-partner/:token', [
  // Validação do token
  param('token')
    .trim()
    .isHexadecimal()
    .withMessage('Token deve conter apenas caracteres hexadecimais')
    .isLength({ min: 64, max: 64 })
    .withMessage('Token deve ter exatamente 64 caracteres'),
  // Validação de parâmetros de consulta
  ...validateQueryParams,
  // Middleware de tratamento de erros
  handleValidationErrors,
  // Rate limiting
  partnerApprovalLimiter,
  // Log de tentativas
  logApprovalAttempt
], approvalController.rejectPartner);

// Rota de verificação de saúde
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'approval-service',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Manipulador para rotas não encontradas
router.use((req, res) => {
  logger.warn('Rota de aprovação não encontrada', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: 'Endpoint não encontrado',
    path: req.path
  });
});

// Middleware de tratamento de erros
router.use((err, req, res, next) => {
  logger.error('Erro na rota de aprovação', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Se os cabeçalhos já foram enviados, delegar para o manipulador de erros padrão do Express
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Ocorreu um erro interno no servidor',
    // Apenas incluir stack em desenvolvimento
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = router;
