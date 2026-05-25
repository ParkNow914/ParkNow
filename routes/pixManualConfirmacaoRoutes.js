// routes/pixManualConfirmacaoRoutes.js
//
// Rotas do fluxo PIX manual (always free):
//   - Usuário envia comprovante após pagar
//   - Admin lista pendentes / confirma / rejeita
//
// As rotas /admin/* são montadas sob /api/admin (que já aplica protectAdmin).
// A rota /reservas/:id/comprovante é montada sob /api (precisa protectUser).

const express = require('express');
const router = express.Router();
const { param, body } = require('express-validator');
const ctrl = require('../controllers/pixManualConfirmacaoController');
const { handleValidationErrors } = require('../middleware/validationMiddleware');
const upload = require('../middleware/uploadMiddleware');
const auditLog = require('../middleware/auditLog');

/**
 * @swagger
 * /api/admin/pagamentos/aguardando-confirmacao:
 *   get:
 *     summary: Lista pagamentos PIX aguardando confirmação manual do admin
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/pagamentos/aguardando-confirmacao',
    ctrl.listarAguardandoConfirmacao
);

/**
 * @swagger
 * /api/admin/reservas/{id}/confirmar-pagamento:
 *   post:
 *     summary: Admin confirma manualmente o pagamento PIX de uma reserva
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/reservas/:id/confirmar-pagamento',
    [param('id').isInt({ min: 1 }).toInt()],
    handleValidationErrors,
    auditLog('payment.admin_confirm'),
    ctrl.confirmarPagamento
);

/**
 * @swagger
 * /api/admin/reservas/{id}/rejeitar-pagamento:
 *   post:
 *     summary: Admin rejeita um pagamento PIX (comprovante inválido / valor errado)
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/reservas/:id/rejeitar-pagamento',
    [
        param('id').isInt({ min: 1 }).toInt(),
        body('motivo').isString().trim().isLength({ min: 3, max: 500 }),
    ],
    handleValidationErrors,
    auditLog('payment.admin_reject'),
    ctrl.rejeitarPagamento
);

// Separate router for user-facing upload (mounted in routes/index.js)
const userRouter = express.Router();

/**
 * @swagger
 * /api/reservas/{id}/comprovante:
 *   post:
 *     summary: Usuário envia comprovante PIX de uma reserva
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               comprovante:
 *                 type: string
 *                 format: binary
 */
userRouter.post(
    '/reservas/:id/comprovante',
    [param('id').isInt({ min: 1 }).toInt()],
    handleValidationErrors,
    upload.single('comprovante'),
    auditLog('payment.user_send_proof'),
    ctrl.enviarComprovante
);

module.exports = router;
module.exports.userRouter = userRouter;
