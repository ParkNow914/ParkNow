// routes/reservaPagamentoRoutes.js
//
// Rotas do fluxo PIX manual (always free, sem gateway pago).
// Webhook ASAAS removido — confirmação agora é manual via /admin/reservas/:id/confirmar-pagamento.

const express = require('express');
const router = express.Router();
const reservaPagamentoController = require('../controllers/reservaPagamentoController');
const { protectUser } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotency');
const auditLog = require('../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   name: Reservas com Pagamento
 *   description: Reservas com pagamento PIX manual (always free)
 */

/**
 * @swagger
 * /api/reservas/com-pagamento:
 *   post:
 *     summary: Cria uma reserva e gera PIX (BR Code) para pagamento manual
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/com-pagamento',
    protectUser,
    idempotency(),
    auditLog('payment.create_reservation'),
    reservaPagamentoController.criarReservaComPagamento.bind(reservaPagamentoController)
);

/**
 * @swagger
 * /api/reservas/{id}/pix:
 *   get:
 *     summary: Retorna o PIX (copia-e-cola + QR base64) da última reserva
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/:id/pix',
    protectUser,
    reservaPagamentoController.obterPixPorReserva.bind(reservaPagamentoController)
);

/**
 * @swagger
 * /api/pagamentos/{id}/status:
 *   get:
 *     summary: Consulta o status atual de um pagamento PIX
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/pagamentos/:id/status',
    protectUser,
    reservaPagamentoController.consultarStatusPagamento.bind(reservaPagamentoController)
);

/**
 * @swagger
 * /api/pagamentos/{id}/novo-qrcode:
 *   post:
 *     summary: Regenera o PIX para uma reserva ainda pendente
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/pagamentos/:id/novo-qrcode',
    protectUser,
    idempotency(),
    reservaPagamentoController.gerarNovoQRCode.bind(reservaPagamentoController)
);

module.exports = router;
