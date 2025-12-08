const express = require('express');
const router = express.Router();

// Import controllers and middleware
const paymentController = require('../controllers/paymentController');
const { protectUser } = require('../middleware/authMiddleware');
const { handleValidationErrors: validateRequest } = require('../middleware/validationMiddleware');
const { body, param, query, validationResult } = require('express-validator');

// Log router initialization
console.log('[Payment Routes] Initializing payment routes...');
console.log('[Payment Routes] Router type:', typeof router);
console.log('[Payment Routes] Router constructor:', router.constructor.name);

// Middleware para verificar se o módulo está habilitado
const checkPaymentModule = (req, res, next) => {
    console.log('[checkPaymentModule] Verificando status do módulo de pagamento');
    console.log(`[checkPaymentModule] ENABLE_PAYMENT_MODULE: ${process.env.ENABLE_PAYMENT_MODULE}`);

    if (process.env.ENABLE_PAYMENT_MODULE !== 'true') {
        console.log('[checkPaymentModule] Módulo de pagamento desativado, retornando 503');
        return res.status(503).json({
            success: false,
            message: 'Módulo de pagamento está temporariamente desativado.'
        });
    }

    console.log('[checkPaymentModule] Módulo de pagamento ativado, continuando...');
    return next();
};

// Habilitar o módulo de pagamento por padrão
if (typeof process.env.ENABLE_PAYMENT_MODULE === 'undefined') {
    console.log('[Payment Routes] Definindo ENABLE_PAYMENT_MODULE=true por padrão');
    process.env.ENABLE_PAYMENT_MODULE = 'true';
}

// Middleware para validar IDs
const validateId = [
    param('id').isInt({ min: 1 }).withMessage('ID inválido')
];

// Middleware para validação de pagamento
const validatePayment = [
    body('metodo_pagamento').isIn(Object.values(require('../config/constants').PAYMENT_METHODS)),
    body('dados_pagamento').isObject().withMessage('Dados de pagamento inválidos')
];

// Middleware para validação de paginação
const validatePagination = [
    query('pagina').optional().isInt({ min: 1 }).withMessage('Página inválida').toInt(),
    query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('Limite inválido').toInt()
];

// Aplica o middleware de autenticação em todas as rotas
// e verifica se o módulo de pagamento está habilitado
router.use(protectUser);
router.use(checkPaymentModule);

// Adiciona um log para depuração
console.log(`[Payment Routes] Rotas de pagamento carregadas (módulo ${process.env.ENABLE_PAYMENT_MODULE === 'true' ? 'ativado' : 'desativado'})`);

/**
 * @swagger
 * tags:
 *   name: Pagamentos
 *   description: Gerenciamento de pagamentos
 */

/**
 * @swagger
 * /api/payments/processar-pagamento/{reservaId}:
 *   post:
 *     summary: Processa um pagamento para uma reserva
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da reserva
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - metodo_pagamento
 *               - dados_pagamento
 *             properties:
 *               metodo_pagamento:
 *                 type: string
 *                 enum: [pix, cartao_credito, cartao_debito, dinheiro]
 *                 description: Método de pagamento
 *               dados_pagamento:
 *                 type: object
 *                 description: Dados específicos do método de pagamento
 *     responses:
 *       200:
 *         description: Pagamento processado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Reserva não encontrada
 *       403:
 *         description: Acesso negado
 */
// Define the route handler function as a separate function
function processarPagamentoHandler(req, res, next) {
    console.log('[processarPagamentoHandler] Iniciando processamento de pagamento');

    // Ensure the controller method exists
    if (typeof paymentController.processarPagamento !== 'function') {
        const error = new Error('Método processarPagamento não encontrado no controlador');
        console.error(error);
        return next(error);
    }

    // Log the request details for debugging
    console.log(`[processarPagamentoHandler] Processando pagamento para reserva: ${req.params.reservaId}`);

    // Call the controller method with proper error handling
    Promise.resolve()
        .then(() => paymentController.processarPagamento(req, res, next))
        .catch(error => {
            console.error('[processarPagamentoHandler] Erro ao processar pagamento:', error);
            next(error);
        });
}

// Validation middleware for payment processing
const validatePaymentRequest = [
    // Validate reservaId parameter
    (req, res, next) => {
        console.log('[Payment Routes] Validating reservaId parameter');
        param('reservaId')
            .isInt({ min: 1 })
            .withMessage('ID da reserva inválido')
            .toInt()
            .run(req);

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('[Payment Routes] Validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        next();
    },
    // Validate request body
    (req, res, next) => {
        console.log('[Payment Routes] Validating request body');
        body('metodoPagamento')
            .isIn(['pix', 'cartao', 'boleto'])
            .withMessage('Método de pagamento inválido')
            .run(req);

        // Add more validations as needed

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('[Payment Routes] Request body validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        next();
    }
];

// Register a simple test route
console.log('Registering test route...');
router.get('/test-express', function(req, res) {
    console.log('Test route hit!');
    res.json({
        success: true,
        message: 'Express router is working!',
        timestamp: new Date().toISOString()
    });
});

// Register the payment route
const routePath = '/processar-pagamento/:reservaId';
console.log(`[Payment Routes] Registering route POST ${routePath}`);

router.post(
    routePath,
    // Middleware to log the request
    function(req, res, next) {
        console.log('Payment route hit:', req.method, req.originalUrl);
        next();
    },
    // Validation middleware
    [
        param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')
    ],
    validateRequest,
    // Main handler - calls the actual controller
    (req, res, next) => {
        return paymentController.processarPagamento(req, res, next);
    }
);

/**
 * @swagger
 * /api/payments/meus-pagamentos:
 *   get:
 *     summary: Lista os pagamentos do usuário
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *         description: Número da página
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *         description: Limite de resultados por página
 *     responses:
 *       200:
 *         description: Pagamentos listados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     pagamentos:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Pagamento'
 *                     paginacao:
 *                       $ref: '#/components/schemas/Paginacao'
 *       401:
 *         description: Não autorizado
 */
router.get(
    '/meus-pagamentos',
    validatePagination,
    validateRequest,
    (req, res, next) => {
        return paymentController.listarMeusPagamentos(req, res, next);
    }
);

/**
 * @swagger
 * /api/payments/webhook/{provedor}:
 *   post:
 *     summary: Webhook para notificações de pagamento (público)
 *     tags: [Pagamentos]
 *     parameters:
 *       - in: path
 *         name: provedor
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pix, asaas]
 *         description: Provedor de pagamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Requisição inválida
 *       401:
 *         description: Assinatura inválida
 */
router.post(
    '/webhook/:provedor',
    express.raw({ type: 'application/json' }), // Importante para webhooks que enviam dados brutos
    (req, res, next) => {
        return paymentController.webhookPagamento(req, res, next);
    }
);

// Rotas de compatibilidade (mantidas para não quebrar clientes existentes)
router.post(
    '/reservas/:reservaId/pix',
    [
        param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')
    ],
    validateRequest,
    (req, res, next) => {
        return paymentController.processarPagamento(req, res, next);
    }
);

router.get(
    '/reservas/:reservaId/status-pagamento',
    [
        param('reservaId').isInt({ min: 1 }).withMessage('ID da reserva inválido')
    ],
    validateRequest,
    (req, res, next) => {
        return paymentController.verificarStatusPagamento(req, res, next);
    }
);

module.exports = router;
