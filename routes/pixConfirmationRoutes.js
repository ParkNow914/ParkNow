const express = require('express');
const router = express.Router();
const pixConfirmationController = require('../controllers/pixConfirmationController');
const { protectUser } = require('../middleware/authMiddleware');
const { checkUserRole } = require('../middleware/roleMiddleware');

/**
 * @swagger
 * tags:
 *   name: Confirmação PIX
 *   description: Endpoints para gerenciar a confirmação de pagamentos PIX
 */

/**
 * @swagger
 * /api/reservas/{reservaId}/pix:
 *   get:
 *     summary: Obtém os dados do PIX para uma reserva
 *     tags: [Confirmação PIX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *     responses:
 *       200:
 *         description: Dados do PIX para pagamento
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
 *                     chave_pix:
 *                       type: string
 *                     tipo_chave_pix:
 *                       type: string
 *                     nome_titular:
 *                       type: string
 *                     valor:
 *                       type: number
 *                     descricao:
 *                       type: string
 */
router.get('/reservas/:reservaId/pix', protectUser, pixConfirmationController.getPixDetails);

/**
 * @swagger
 * /api/reservas/{reservaId}/notificar-pagamento:
 *   post:
 *     summary: Notifica o estacionamento sobre uma ação de pagamento PIX
 *     tags: [Confirmação PIX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [pix_copiado, pagamento_confirmado]
 *                 description: Tipo de notificação
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora do evento
 *     responses:
 *       200:
 *         description: Notificação enviada com sucesso
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
 *                   properties:
 *                     reserva_id:
 *                       type: string
 *                     tipo_notificacao:
 *                       type: string
 *                     data_hora:
 *                       type: string
 *                       format: date-time
 */
router.post('/reservas/:reservaId/notificar-pagamento', 
  protectUser, 
  pixConfirmationController.notificarPagamentoPix
);

/**
 * @swagger
 * /api/reservas/{reservaId}/confirmar-pix:
 *   post:
 *     summary: Confirma o recebimento de um pagamento PIX
 *     tags: [Confirmação PIX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - valorRecebido
 *             properties:
 *               valorRecebido:
 *                 type: number
 *                 description: Valor recebido via PIX
 *     responses:
 *       200:
 *         description: Pagamento confirmado com sucesso
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
 *                   properties:
 *                     reservaId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     statusPagamento:
 *                       type: string
 */
router.post('/reservas/:reservaId/confirmar-pix', protectUser, pixConfirmationController.confirmarPagamentoPix);

module.exports = router;
