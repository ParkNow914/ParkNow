const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { validatePayment, validatePaymentId, validateWebhook } = require('../middlewares/validation');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Cria um novo pagamento com split
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - description
 *               - paymentMethod
 *               - payer
 *               - parkingId
 *               - parkingReceiverId
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Valor total do pagamento
 *               description:
 *                 type: string
 *                 description: Descrição do pagamento
 *               paymentMethod:
 *                 type: string
 *                 enum: [pix, credit_card, debit_card]
 *                 description: Método de pagamento
 *               installments:
 *                 type: integer
 *                 description: Número de parcelas (apenas cartão de crédito)
 *                 default: 1
 *               card:
 *                 type: object
 *                 description: Dados do cartão (obrigatório para pagamentos com cartão)
 *                 properties:
 *                   token:
 *                     type: string
 *                     description: Token do cartão gerado pelo Mercado Pago
 *                   issuerId:
 *                     type: string
 *                     description: ID do emissor do cartão
 *               payer:
 *                 type: object
 *                 required:
 *                   - email
 *                   - firstName
 *                   - lastName
 *                   - identification
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: E-mail do pagador
 *                   firstName:
 *                     type: string
 *                     description: Nome do pagador
 *                   lastName:
 *                     type: string
 *                     description: Sobrenome do pagador
 *                   identification:
 *                     type: object
 *                     description: Dados de identificação do pagador
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [CPF, CNPJ]
 *                         description: Tipo de documento
 *                       number:
 *                         type: string
 *                         description: Número do documento
 *               parkingId:
 *                 type: string
 *                 description: ID do estacionamento
 *               parkingReceiverId:
 *                 type: string
 *                 description: ID do recebedor do estacionamento no Mercado Pago
 *               externalReference:
 *                 type: string
 *                 description: Referência externa para o pagamento (opcional)
 *     responses:
 *       201:
 *         description: Pagamento criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/payments', authenticate, validatePayment, paymentController.createPayment);

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Obtém os detalhes de um pagamento
 *     tags: [Payments]
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
 *         description: Detalhes do pagamento
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       404:
 *         description: Pagamento não encontrado
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 */
router.get('/payments/:id', authenticate, validatePaymentId, paymentController.getPayment);

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Lista pagamentos com filtros
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número da página
 *         default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Número de itens por página
 *         default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filtro por status
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *         description: Filtro por método de pagamento
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Data inicial para filtro
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Data final para filtro
 *     responses:
 *       200:
 *         description: Lista de pagamentos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Não autorizado
 */
router.get('/payments', authenticate, paymentController.listPayments);

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Webhook para receber notificações do Mercado Pago
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processado com sucesso
 *       400:
 *         description: Requisição inválida
 *       401:
 *         description: Assinatura inválida
 *       500:
 *         description: Erro interno do servidor
 */
router.post('/payments/webhook', validateWebhook, paymentController.processWebhook);

module.exports = router;
