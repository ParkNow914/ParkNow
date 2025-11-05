const express = require('express');
const router = express.Router();
const cronController = require('../controllers/cronController');
const { validateApiKey } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Tarefas Agendadas
 *   description: Endpoints para tarefas agendadas (cron jobs)
 */

/**
 * @swagger
 * /cron/verificar-reservas-expiradas:
 *   post:
 *     summary: Verifica e processa reservas PIX expiradas
 *     tags: [Tarefas Agendadas]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Processamento concluído com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 reservasProcessadas:
 *                   type: number
 */
router.post('/verificar-reservas-expiradas', validateApiKey, cronController.verificarReservasExpiradas);

/**
 * @swagger
 * /cron/expirar-reservas-pendentes:
 *   post:
 *     summary: Expira reservas pendentes que já passaram do horário
 *     tags: [Tarefas Agendadas]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Processamento concluído com sucesso
 */
router.post('/expirar-reservas-pendentes', validateApiKey, cronController.expirarReservasPendentes);

module.exports = router;
