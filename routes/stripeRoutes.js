const express = require('express');
const router = express.Router();
const stripePaymentController = require('../controllers/stripePaymentController');
const { protectUser } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

// Middleware to handle validation results
const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

/**
 * @route POST /api/stripe/reservas
 * @desc Criar reserva com pagamento Stripe (PIX, Cartão, Boleto)
 * @access Private
 */
router.post(
    '/reservas',
    protectUser,
    [
        body('estacionamento_id').isInt().withMessage('ID do estacionamento é obrigatório'),
        body('data_entrada').isISO8601().withMessage('Data de entrada inválida'),
        body('data_saida').isISO8601().withMessage('Data de saída inválida'),
        body('metodo_pagamento')
            .isIn(['pix', 'card', 'boleto'])
            .withMessage('Método de pagamento inválido'),
        body('veiculo_placa').optional().isString(),
        body('vaga_id').optional().isInt(),
        body('observacoes').optional().isString()
    ],
    handleValidation,
    stripePaymentController.criarReservaComStripe
);

/**
 * @route POST /api/stripe/estacionamentos/:estacionamento_id/conectar
 * @desc Conectar estacionamento ao Stripe
 * @access Private (Admin do estacionamento)
 */
router.post(
    '/estacionamentos/:estacionamento_id/conectar',
    protectUser,
    stripePaymentController.conectarEstacionamento
);

/**
 * @route GET /api/stripe/estacionamentos/:estacionamento_id/status
 * @desc Verificar status da conexão Stripe
 * @access Private
 */
router.get(
    '/estacionamentos/:estacionamento_id/status',
    protectUser,
    stripePaymentController.verificarStatusConexao
);

/**
 * @route POST /api/stripe/webhook
 * @desc Webhook para receber eventos do Stripe
 * @access Public (validado por assinatura)
 * @note Precisa de express.raw() no body parser
 */
router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    stripePaymentController.webhook
);

/**
 * @route POST /api/stripe/pagamentos/:pagamento_id/cancelar
 * @desc Cancelar pagamento
 * @access Private
 */
router.post(
    '/pagamentos/:pagamento_id/cancelar',
    protectUser,
    stripePaymentController.cancelarPagamento
);

/**
 * @route POST /api/stripe/pagamentos/:pagamento_id/reembolsar
 * @desc Reembolsar pagamento
 * @access Private (Admin do estacionamento)
 */
router.post(
    '/pagamentos/:pagamento_id/reembolsar',
    protectUser,
    [
        body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valor inválido')
    ],
    handleValidation,
    stripePaymentController.reembolsarPagamento
);

module.exports = router;
