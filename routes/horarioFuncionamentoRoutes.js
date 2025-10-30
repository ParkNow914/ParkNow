const express = require('express');
const HorarioFuncionamentoController = require('../controllers/horarioFuncionamentoController');
const authMiddleware = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');
const { checkUserIsEstacionamentoAdmin } = require('../middleware/estacionamentoMiddleware');
const {
  validateHorarioId,
  validateEstacionamentoId,
  validateHorarioBody,
  validateHorariosLote
} = require('../middleware/validators/horarioFuncionamentoValidators');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authMiddleware.protectUser);

/**
 * @swagger
 * tags:
 *   name: Horários de Funcionamento
 *   description: Gerenciamento de horários de funcionamento dos estacionamentos
 */

/**
 * @swagger
 * /api/horarios/estacionamento/{estacionamentoId}/status:
 *   get:
 *     summary: Verifica se o estacionamento está aberto no momento
 *     tags: [Horários de Funcionamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: estacionamentoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     responses:
 *       200:
 *         description: Status atual do estacionamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 aberto:
 *                   type: boolean
 *                   description: Indica se o estacionamento está aberto no momento
 *                 horarioAtual:
 *                   type: string
 *                   description: Status atual (aberto/fechado)
 *                   enum: [aberto, fechado]
 *                 proximoHorario:
 *                   type: object
 *                   description: Próximo horário de funcionamento (se aplicável)
 *                   properties:
 *                     abertura:
 *                       type: string
 *                       format: time
 *                       description: Horário de abertura
 *                     dia:
 *                       type: string
 *                       description: Dia da semana da próxima abertura
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Estacionamento não encontrado ou horários não configurados
 */
router.get(
  '/estacionamento/:estacionamentoId/status',
  validateEstacionamentoId,
  handleValidationErrors,
  checkUserIsEstacionamentoAdmin,
  HorarioFuncionamentoController.verificarStatusAtual
);

/**
 * @swagger
 * /api/horarios/estacionamento/{estacionamentoId}:
 *   get:
 *     summary: Busca horários de funcionamento de um estacionamento
 *     tags: [Horários de Funcionamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: estacionamentoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     responses:
 *       200:
 *         description: Lista de horários de funcionamento
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/HorarioFuncionamento'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Estacionamento não encontrado
 */
router.get(
  '/estacionamento/:estacionamentoId',
  validateEstacionamentoId,
  handleValidationErrors,
  checkUserIsEstacionamentoAdmin,
  HorarioFuncionamentoController.buscarPorEstacionamento
);

/**
 * @swagger
 * /api/horarios/{id}:
 *   put:
 *     summary: Atualiza um horário de funcionamento
 *     tags: [Horários de Funcionamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do horário
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HorarioFuncionamentoUpdate'
 *     responses:
 *       200:
 *         description: Horário atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HorarioFuncionamento'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: Horário não encontrado
 */
router.put(
  '/:id',
  validateHorarioId,
  validateHorarioBody,
  handleValidationErrors,
  checkUserIsEstacionamentoAdmin,
  HorarioFuncionamentoController.atualizar
);

/**
 * @swagger
 * /api/horarios/estacionamento/{estacionamentoId}/lote:
 *   put:
 *     summary: Atualiza vários horários de uma vez
 *     tags: [Horários de Funcionamento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: estacionamentoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do estacionamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - horarios
 *             properties:
 *               horarios:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/HorarioFuncionamentoUpdate'
 *     responses:
 *       200:
 *         description: Horários atualizados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/HorarioFuncionamento'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.put(
  '/estacionamento/:estacionamentoId/lote',
  validateEstacionamentoId,
  validateHorariosLote,
  handleValidationErrors,
  checkUserIsEstacionamentoAdmin,
  HorarioFuncionamentoController.atualizarVarios
);

// Exporta o router
module.exports = router;
