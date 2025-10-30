const express = require('express');
const router = express.Router();
const manualPixController = require('../controllers/manualPixController');
const { protectUser } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: PIX Manual
 *   description: Endpoints para pagamento PIX manual
 */

/**
 * @swagger
 * /api/pix/iniciar:
 *   post:
 *     summary: Inicia um pagamento PIX manual
 *     tags: [PIX Manual]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estacionamento_id
 *               - data_entrada
 *               - data_saida
 *               - valor
 *             properties:
 *               estacionamento_id:
 *                 type: string
 *               data_entrada:
 *                 type: string
 *                 format: date-time
 *               data_saida:
 *                 type: string
 *                 format: date-time
 *               valor:
 *                 type: number
 *               veiculo_placa:
 *                 type: string
 *               vaga_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pagamento PIX iniciado com sucesso
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 */
router.post('/iniciar', protectUser, manualPixController.iniciarPagamento);

/**
 * @swagger
 * /api/pix/confirmar/{reservaId}/{codigoConfirmacao}:
 *   post:
 *     summary: Confirma o pagamento de uma reserva (chamado pelo dono do estacionamento)
 *     tags: [PIX Manual]
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: codigoConfirmacao
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pagamento confirmado com sucesso
 *       400:
 *         description: Código de confirmação inválido
 *       404:
 *         description: Reserva não encontrada
 */
router.post('/confirmar/:reservaId/:codigoConfirmacao', manualPixController.confirmarPagamento);

/**
 * @swagger
 * /api/pix/status/{reservaId}:
 *   get:
 *     summary: Verifica o status de uma reserva
 *     tags: [PIX Manual]
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status da reserva
 *       404:
 *         description: Reserva não encontrada
 */
router.get('/status/:reservaId', manualPixController.verificarStatus);

/**
 * @swagger
 * /api/pix/confirmar-pagamento:
 *   post:
 *     summary: Confirma que o usuário efetuou o pagamento PIX (chamado pelo frontend)
 *     tags: [PIX Manual]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reservaId
 *               - estacionamentoId
 *             properties:
 *               reservaId:
 *                 type: string
 *                 description: ID da reserva
 *               estacionamentoId:
 *                 type: string
 *                 description: ID do estacionamento
 *     responses:
 *       200:
 *         description: Confirmação de pagamento recebida com sucesso
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
 *                     proximosPassos:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Dados inválidos ou estacionamento não configurado para PIX
 *       401:
 *         description: Não autorizado
 *       404:
 *         description: Reserva não encontrada
 *       500:
 *         description: Erro ao processar a confirmação de pagamento
 */
router.post('/confirmar-pagamento', protectUser, manualPixController.confirmarPagamentoFrontend);

module.exports = router;
