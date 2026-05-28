// routes/paymentRoutes.js
// Rotas de pagamento (PIX manual). Limpo de console.log e dead code.

const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const { protectUser } = require('../middleware/authMiddleware');
const { handleValidationErrors: validateRequest } = require('../middleware/validationMiddleware');
const { param, query } = require('express-validator');
const logger = require('../utils/logger');

// Habilita o módulo de pagamento por padrão (pode ser desligado via env).
if (typeof process.env.ENABLE_PAYMENT_MODULE === 'undefined') {
    process.env.ENABLE_PAYMENT_MODULE = 'true';
}

// Middleware: bloqueia se o módulo estiver desativado.
const checkPaymentModule = (req, res, next) => {
    if (process.env.ENABLE_PAYMENT_MODULE !== 'true') {
        return res.status(503).json({
            success: false,
            message: 'Módulo de pagamento está temporariamente desativado.',
        });
    }
    return next();
};

const validatePagination = [
    query('pagina').optional().isInt({ min: 1 }).withMessage('Página inválida').toInt(),
    query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('Limite inválido').toInt(),
];

// Autenticação + checagem do módulo em todas as rotas.
router.use(protectUser);
router.use(checkPaymentModule);

logger.info('[paymentRoutes] rotas de pagamento carregadas');

/**
 * @swagger
 * tags:
 *   name: Pagamentos
 *   description: Gerenciamento de pagamentos PIX
 */

/**
 * @swagger
 * /api/payments/processar-pagamento/{reservaId}:
 *   post:
 *     summary: Processa um pagamento PIX para uma reserva
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema: { type: integer }
 */
router.post(
    '/processar-pagamento/:reservaId',
    [param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')],
    validateRequest,
    (req, res, next) => paymentController.processarPagamento(req, res, next)
);

/**
 * @swagger
 * /api/payments/meus-pagamentos:
 *   get:
 *     summary: Lista os pagamentos do usuário
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/meus-pagamentos',
    validatePagination,
    validateRequest,
    (req, res, next) => paymentController.listarMeusPagamentos(req, res, next)
);

/**
 * @swagger
 * /api/payments/status/{pagamentoId}:
 *   get:
 *     summary: Verifica o status de um pagamento
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/status/:pagamentoId',
    [param('pagamentoId').isInt({ min: 1 }).withMessage('ID do pagamento inválido')],
    validateRequest,
    (req, res, next) => paymentController.verificarStatusPagamento(req, res, next)
);

// --- Rotas de compatibilidade (clientes antigos) ---
router.post(
    '/reservas/:reservaId/pix',
    [param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')],
    validateRequest,
    (req, res, next) => paymentController.processarPagamento(req, res, next)
);

router.get(
    '/reservas/:reservaId/status-pagamento',
    [param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')],
    validateRequest,
    (req, res, next) => paymentController.verificarStatusPagamento(req, res, next)
);

module.exports = router;
