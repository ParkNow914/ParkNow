const express = require('express');
const router = express.Router();
const estacionamentoPaymentController = require('../controllers/estacionamentoPaymentController');
const { protectUser } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/v2/authMiddleware');

// Middleware para verificar se o usuário está autenticado
router.use(protectUser);

/**
 * @swagger
 * /api/estacionamentos/{id}/pagamento/configuracao:
 *   get:
 *     summary: Obtém as configurações de pagamento de um estacionamento
 *     tags: [Estacionamento - Pagamento]
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
 *         description: Configurações de pagamento obtidas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ConfiguracaoPagamento'
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Estacionamento não encontrado
 */
router.get('/:id/pagamento/configuracao', 
    authorizeRoles(['admin', 'estacionamento']), 
    estacionamentoPaymentController.obterConfiguracaoPagamento
);

/**
 * @swagger
 * /api/estacionamentos/{id}/pagamento/configuracao:
 *   put:
 *     summary: Atualiza as configurações de pagamento de um estacionamento
 *     tags: [Estacionamento - Pagamento]
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
 *             $ref: '#/components/schemas/ConfiguracaoPagamentoInput'
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
 *                   $ref: '#/components/schemas/ConfiguracaoPagamento'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autorizado
 *       403:
 *         description: Acesso negado
 */
router.put('/:id/pagamento/configuracao', 
    authorizeRoles(['admin', 'estacionamento']), 
    estacionamentoPaymentController.atualizarConfiguracaoPagamento
);

/**
 * @swagger
 * /api/estacionamentos/pagamento/opcoes:
 *   get:
 *     summary: Obtém as opções disponíveis para configuração de pagamento
 *     tags: [Estacionamento - Pagamento]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opções obtidas com sucesso
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
 *                     tipos_chave_pix:
 *                       type: array
 *                       items:
 *                         type: string
 *                     tipos_conta:
 *                       type: array
 *                       items:
 *                         type: string
 *                     metodos_pagamento:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/pagamento/opcoes', 
    protectUser, 
    estacionamentoPaymentController.obterOpcoesConfiguracao
);

/**
 * @swagger
 * components:
 *   schemas:
 *     ConfiguracaoPagamento:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da configuração
 *         estacionamento_id:
 *           type: integer
 *           description: ID do estacionamento
 *         tipo_chave_pix:
 *           type: string
 *           enum: [CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA]
 *           description: Tipo da chave PIX
 *         possui_chave_pix:
 *           type: boolean
 *           description: Indica se o estacionamento possui chave PIX cadastrada
 *         nome_titular:
 *           type: string
 *           description: Nome do titular da conta
 *         banco:
 *           type: string
 *           nullable: true
 *           description: Nome do banco (opcional)
 *         tipo_conta:
 *           type: string
 *           enum: [CONTA_CORRENTE, CONTA_POUPANCA, CONTA_PAGAMENTO]
 *           description: Tipo de conta bancária
 *         agencia:
 *           type: string
 *           nullable: true
 *           description: Número da agência (opcional)
 *         conta:
 *           type: string
 *           nullable: true
 *           description: Número da conta (opcional)
 *         data_criacao:
 *           type: string
 *           format: date-time
 *           description: Data de criação do registro
 *         data_atualizacao:
 *           type: string
 *           format: date-time
 *           description: Data da última atualização
 *     ConfiguracaoPagamentoInput:
 *       type: object
 *       required:
 *         - tipo_chave_pix
 *         - chave_pix
 *         - nome_titular
 *       properties:
 *         tipo_chave_pix:
 *           type: string
 *           enum: [CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA]
 *           description: Tipo da chave PIX
 *         chave_pix:
 *           type: string
 *           description: Valor da chave PIX (CPF/CNPJ apenas números, e-mail válido, telefone com DDD)
 *         nome_titular:
 *           type: string
 *           description: Nome do titular da conta (como consta no banco)
 *         banco:
 *           type: string
 *           nullable: true
 *           description: Nome do banco (opcional)
 *         tipo_conta:
 *           type: string
 *           enum: [CONTA_CORRENTE, CONTA_POUPANCA, CONTA_PAGAMENTO]
 *           default: CONTA_CORRENTE
 *           description: Tipo de conta bancária
 *         agencia:
 *           type: string
 *           nullable: true
 *           description: Número da agência (opcional)
 *         conta:
 *           type: string
 *           nullable: true
 *           description: Número da conta (opcional)
 */

module.exports = router;
