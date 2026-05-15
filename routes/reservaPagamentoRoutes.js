const express = require('express');
const router = express.Router();
const reservaPagamentoController = require('../controllers/reservaPagamentoController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');
const asaasWebhookAuth = require('../middleware/asaasWebhookAuth');
const idempotency = require('../middleware/idempotency');
const auditLog = require('../middleware/auditLog');

/**
 * @swagger
 * tags:
 *   name: Reservas com Pagamento
 *   description: Gerenciamento de reservas com integração de pagamento
 */

/**
 * @swagger
 * /api/reservas/com-pagamento:
 *   post:
 *     summary: Cria uma nova reserva com pagamento
 *     tags: [Reservas com Pagamento]
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
 *                 type: integer
 *                 description: ID do estacionamento
 *               data_entrada:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora de entrada
 *               data_saida:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora de saída
 *               valor:
 *                 type: number
 *                 format: float
 *                 description: Valor total da reserva
 *               veiculo_placa:
 *                 type: string
 *                 description: Placa do veículo (opcional)
 *               veiculo_modelo:
 *                 type: string
 *                 description: Modelo do veículo (opcional)
 *               observacoes:
 *                 type: string
 *                 description: Observações adicionais (opcional)
 *               metodo_pagamento:
 *                 type: string
 *                 enum: [pix, credit_card, debit_card]
 *                 default: pix
 *                 description: Método de pagamento
 *     responses:
 *       201:
 *         description: Reserva criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ReservaComPagamento'
 *                 message:
 *                   type: string
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/com-pagamento',
  protectUser,
  idempotency(),
  auditLog('payment.create_reservation'),
  reservaPagamentoController.criarReservaComPagamento
);

/**
 * @swagger
 * /api/reservas/{id}/pix:
 *   get:
 *     summary: Retorna o último pagamento PIX da reserva
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da reserva
 *     responses:
 *       200:
 *         description: Dados do PIX encontrados
 *       404:
 *         description: Reserva ou pagamento não encontrado
 */
router.get(
  '/:id/pix',
  protectUser,
  reservaPagamentoController.obterPixPorReserva
);

/**
 * @swagger
 * /api/webhooks/asaas:
 *   post:
 *     summary: Webhook para notificações do ASAAS
 *     tags: [Reservas com Pagamento]
 *     description: Endpoint para receber notificações de atualização de pagamento
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 */
router.post(
  '/webhooks/asaas',
  asaasWebhookAuth,
  auditLog('payment.webhook.asaas'),
  reservaPagamentoController.webhookPagamento
);

/**
 * @swagger
 * /api/pagamentos/{id}/status:
 *   get:
 *     summary: Consulta o status de um pagamento
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Status do pagamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/StatusPagamento'
 *       404:
 *         description: Pagamento não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
router.get(
  '/pagamentos/:id/status',
  protectUser,
  reservaPagamentoController.consultarStatusPagamento
);

/**
 * @swagger
 * /api/pagamentos/{id}/novo-qrcode:
 *   post:
 *     summary: Gera um novo QR Code para pagamento PIX
 *     tags: [Reservas com Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do pagamento original
 *     responses:
 *       200:
 *         description: Novo QR Code gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PagamentoPIX'
 *                 message:
 *                   type: string
 *       400:
 *         description: Não é possível gerar um novo QR Code para este pagamento
 *       404:
 *         description: Reserva não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
router.post(
  '/pagamentos/:id/novo-qrcode',
  protectUser,
  idempotency(),
  reservaPagamentoController.gerarNovoQRCode
);

module.exports = router;
