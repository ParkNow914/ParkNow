const express = require('express');
const router = express.Router();
const reservaPagamentoController = require('../controllers/reservaPagamentoController');
const authMiddleware = require('../middleware/authMiddleware');
const { deprecate } = require('../middleware/deprecation');

// Endpoints PIX antigos mantidos por compatibilidade — ver docs/ROUTES_PAGAMENTO.md.
// Novos clientes devem usar `/api/reservas/com-pagamento`.
router.use(deprecate({
    replacement: '/api/reservas/com-pagamento',
    sunset: '2027-01-01',
    docs: '/api/docs',
}));

/**
 * @swagger
 * tags:
 *   name: Pagamentos
 *   description: Gerenciamento de pagamentos de reservas
 */

/**
 * @swagger
 * /api/pagamentos/reservar:
 *   post:
 *     summary: Cria uma nova reserva com pagamento
 *     tags: [Pagamentos]
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
 *               - pagador_nome
 *               - pagador_email
 *               - pagador_cpf
 *             properties:
 *               estacionamento_id:
 *                 type: integer
 *                 description: ID do estacionamento
 *               data_entrada:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora de entrada no formato ISO 8601
 *               data_saida:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora de saída no formato ISO 8601
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
 *               pagador_nome:
 *                 type: string
 *                 description: Nome do pagador
 *               pagador_email:
 *                 type: string
 *                 format: email
 *                 description: E-mail do pagador
 *               pagador_cpf:
 *                 type: string
 *                 description: CPF do pagador (apenas números)
 *     responses:
 *       201:
 *         description: Reserva criada com sucesso. Realize o pagamento para confirmar.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ReservaComPagamento'
 *                 message:
 *                   type: string
 *                   example: 'Reserva criada com sucesso. Realize o pagamento para confirmar.'
 *       400:
 *         $ref: '#/components/responses/ErroValidacao'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       500:
 *         $ref: '#/components/responses/ErroServidor'
 */
// Rota para criar reserva com pagamento
router.post(
  '/reservar',
  authMiddleware.protectUser,  // Usa o middleware de autenticação de usuário
  (req, res, next) => {
    reservaPagamentoController.criarReservaComPagamento(req, res, next);
  }
);

/**
 * @swagger
 * /api/pagamentos/webhook:
 *   post:
 *     summary: Webhook para receber notificações de pagamento
 *     tags: [Pagamentos]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do pagamento
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         required: true
 *         description: Tipo de notificação (deve ser 'payment')
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         required: true
 *         description: Ação do pagamento (ex. payment.updated)
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 */
// Rota de webhook não precisa de autenticação
router.post(
  '/webhook',
  (req, res, next) => {
    reservaPagamentoController.webhookPagamento(req, res, next);
  }
);

/**
 * @swagger
 * /api/pagamentos/status/{id}:
 *   get:
 *     summary: Consulta o status de um pagamento
 *     tags: [Pagamentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID do pagamento
 *     responses:
 *       200:
 *         description: Status do pagamento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PagamentoStatus'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       404:
 *         $ref: '#/components/responses/NaoEncontrado'
 *       500:
 *         $ref: '#/components/responses/ErroServidor'
 */
// Rota para consultar status de pagamento
router.get(
  '/status/:id',
  authMiddleware.protectUser,  // Usa o middleware de autenticação de usuário
  (req, res, next) => {
    reservaPagamentoController.consultarStatusPagamento(req, res, next);
  }
);

module.exports = router;
