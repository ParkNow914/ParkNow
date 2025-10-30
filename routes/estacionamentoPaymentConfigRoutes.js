const express = require('express');
const router = express.Router();
const estacionamentoPaymentConfigController = require('../controllers/estacionamentoPaymentConfigController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Configurações de Pagamento
 *   description: Gerenciamento das configurações de pagamento dos estacionamentos
 */

/**
 * @swagger
 * /api/estacionamentos/{id}/config-pagamento:
 *   get:
 *     summary: Obtém as configurações de pagamento de um estacionamento
 *     tags: [Configurações de Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     responses:
 *       200:
 *         description: Configurações de pagamento encontradas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/EstacionamentoPagamentoConfig'
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Estacionamento não encontrado
 */
router.get(
  '/:id/config-pagamento',
  protectUser,
  estacionamentoPaymentConfigController.obterConfiguracaoPagamento
);

/**
 * @swagger
 * /api/estacionamentos/{id}/config-pagamento/validar:
 *   get:
 *     summary: Valida se um estacionamento está configurado para receber pagamentos
 *     tags: [Configurações de Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     responses:
 *       200:
 *         description: Resultado da validação
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
 *                     valido:
 *                       type: boolean
 *                     motivo:
 *                       type: string
 *                     config:
 *                       $ref: '#/components/schemas/EstacionamentoPagamentoConfig'
 */
router.get(
  '/:id/config-pagamento/validar',
  protectUser,
  estacionamentoPaymentConfigController.validarConfiguracaoPagamento
);

/**
 * @swagger
 * /api/estacionamentos/{id}/config-pagamento:
 *   put:
 *     summary: Atualiza as configurações de pagamento de um estacionamento
 *     tags: [Configurações de Pagamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EstacionamentoPagamentoConfigInput'
 *     responses:
 *       200:
 *         description: Configurações de pagamento atualizadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/EstacionamentoPagamentoConfig'
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Estacionamento não encontrado
 */
router.put(
  '/:id/config-pagamento',
  protectAdmin, // Only admin can update payment configurations
  estacionamentoPaymentConfigController.atualizarConfiguracaoPagamento
);

module.exports = router;
