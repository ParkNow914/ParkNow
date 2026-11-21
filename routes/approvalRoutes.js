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
router.post('/approve-partner/:token', [
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
router.post('/reject-partner/:token', [
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

// --- Página de confirmação (GET) ---
// O link do e-mail só abre esta página; a aprovação/rejeição exige clicar no
// botão (POST). Scanners de link (Microsoft Safe Links, antivírus) fazem GET
// automaticamente e antes aprovavam ou rejeitavam parcerias sozinhos.
const tokenParam = param('token').trim().isHexadecimal().isLength({ min: 64, max: 64 });

function paginaConfirmacao(acao) {
  const aprovar = acao === 'aprovar';
  const titulo = aprovar ? 'Aprovar parceria' : 'Rejeitar parceria';
  const cor = aprovar ? '#1f7a4d' : '#b42318';
  const texto = aprovar
    ? 'Confirme para criar a conta do parceiro e o estacionamento.'
    : 'Confirme para rejeitar a solicitação. O solicitante será avisado por e-mail.';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>' + titulo + ' - ParkNow</title>'
    + '<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#1b2430;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}'
    + 'main{background:#fff;border:1px solid #dfe3ea;border-radius:12px;padding:28px;max-width:420px;width:100%}'
    + 'h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;line-height:1.5}'
    + 'button{background:' + cor + ';color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:16px;cursor:pointer;width:100%}'
    + 'button:focus-visible{outline:3px solid #1747b8;outline-offset:2px}</style></head>'
    + '<body><main><h1>' + titulo + '</h1><p>' + texto + '</p>'
    + '<form method="post"><button type="submit">' + titulo + '</button></form></main></body></html>';
}

router.get('/approve-partner/:token', [tokenParam, handleValidationErrors], (req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(paginaConfirmacao('aprovar'));
});
router.get('/reject-partner/:token', [tokenParam, handleValidationErrors], (req, res) => {
  res.set('Cache-Control', 'no-store').type('html').send(paginaConfirmacao('rejeitar'));
});

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
