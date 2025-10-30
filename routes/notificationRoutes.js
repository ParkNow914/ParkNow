// routes/notificationRoutes.js
// Rotas para gerenciar notificações do sistema

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protectUser } = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Notificações
 *   description: Gerenciamento de notificações do usuário
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Lista as notificações do usuário com paginação
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', protectUser, notificationController.listarNotificacoes);

/**
 * @swagger
 * /api/notifications/unread:
 *   get:
 *     summary: Lista as notificações não lidas do usuário
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 */
router.get('/unread', protectUser, notificationController.listarNaoLidas);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Marca uma notificação como lida
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/read', protectUser, notificationController.marcarComoLida);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Marca todas as notificações do usuário como lidas
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/read-all', protectUser, notificationController.marcarTodasComoLidas);

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Envia uma notificação de teste para o usuário
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 */
router.post('/test', protectUser, notificationController.enviarNotificacaoTeste);

module.exports = router;
