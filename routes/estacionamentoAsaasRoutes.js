/**
 * Rotas para gerenciar conexão entre Estacionamentos e ASAAS
 * 
 * Base: /api/admin/estacionamentos
 */

const express = require('express');
const router = express.Router();
const estacionamentoAsaasController = require('../controllers/estacionamentoAsaasController');
const { protectAdmin } = require('../middleware/authMiddleware');

// Todas as rotas exigem autenticação de admin
router.use(protectAdmin);

/**
 * @swagger
 * /api/admin/estacionamentos/{id}/conectar-asaas:
 *   post:
 *     tags: [Admin - Estacionamentos ASAAS]
 *     summary: Conectar estacionamento ao ASAAS (criar subconta)
 *     description: Cria uma subconta ASAAS para o estacionamento e vincula o wallet_id
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
 *         description: Estacionamento conectado ao ASAAS com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Estacionamento conectado ao ASAAS com sucesso!
 *                 data:
 *                   type: object
 *                   properties:
 *                     estacionamento_id:
 *                       type: integer
 *                     wallet_id:
 *                       type: string
 *                     connected_at:
 *                       type: string
 *                       format: date-time
 *                     ambiente:
 *                       type: string
 *                       enum: [SANDBOX, PRODUÇÃO]
 *       400:
 *         description: Dados inválidos ou faltando
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Estacionamento não encontrado
 *       500:
 *         description: Erro ao criar subconta ASAAS
 */
router.post('/:id/conectar-asaas', estacionamentoAsaasController.conectarAsaas);

/**
 * @swagger
 * /api/admin/estacionamentos/{id}/status-asaas:
 *   get:
 *     tags: [Admin - Estacionamentos ASAAS]
 *     summary: Consultar status da conexão ASAAS
 *     description: Verifica se o estacionamento está conectado ao ASAAS
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
 *         description: Status da conexão ASAAS
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
 *                     estacionamento_id:
 *                       type: integer
 *                     nome:
 *                       type: string
 *                     conectado:
 *                       type: boolean
 *                     wallet_id:
 *                       type: string
 *                       nullable: true
 *                     connected_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     ambiente:
 *                       type: string
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Estacionamento não encontrado
 */
router.get('/:id/status-asaas', estacionamentoAsaasController.consultarStatusAsaas);

/**
 * @swagger
 * /api/admin/estacionamentos/{id}/desconectar-asaas:
 *   delete:
 *     tags: [Admin - Estacionamentos ASAAS]
 *     summary: Desconectar estacionamento do ASAAS
 *     description: Remove a referência do wallet ASAAS do estacionamento (não deleta a subconta)
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
 *         description: Estacionamento desconectado com sucesso
 *       403:
 *         description: Sem permissão (apenas admin principal)
 *       404:
 *         description: Estacionamento não encontrado
 */
router.delete('/:id/desconectar-asaas', estacionamentoAsaasController.desconectarAsaas);

module.exports = router;
