// controllers/notificationController.js
// Controlador para gerenciar notificações do sistema

const NotificacaoService = require('../services/notificacaoService');
const socketService = require('../services/socketService');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

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
 *     summary: Lista as notificações do usuário
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Número de itens por página
 *       - in: query
 *         name: onlyUnread
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Retornar apenas notificações não lidas
 *     responses:
 *       200:
 *         description: Lista de notificações
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notificacao'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
const listarNotificacoes = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, onlyUnread = false } = req.query;
        const userId = req.user.id;

        const result = await NotificacaoService.buscarNotificacoes(userId, { 
            page: parseInt(page), 
            limit: parseInt(limit),
            onlyUnread: onlyUnread === 'true'
        });

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (error) {
        logger.error('Erro ao listar notificações:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        next(error);
    }
};

/**
 * @swagger
 * /api/notifications/unread:
 *   get:
 *     summary: Lista as notificações não lidas do usuário
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de notificações não lidas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notificacao'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
const listarNaoLidas = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const notificacoes = await NotificacaoService.buscarNaoLidas(userId);
        
        res.json({
            success: true,
            data: notificacoes
        });
    } catch (error) {
        logger.error('Erro ao listar notificações não lidas:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        next(error);
    }
};

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Marca uma notificação como lida
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da notificação
 *     responses:
 *       200:
 *         description: Notificação marcada como lida
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Notificacao'
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
const marcarComoLida = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        
        if (!id) {
            throw new AppError('ID da notificação é obrigatório', 400);
        }
        
        const notificacao = await NotificacaoService.marcarComoLida(id, userId);
        
        res.json({
            success: true,
            data: notificacao
        });
    } catch (error) {
        logger.error('Erro ao marcar notificação como lida:', {
            error: error.message,
            stack: error.stack,
            notificacaoId: req.params?.id,
            userId: req.user?.id
        });
        next(error);
    }
};

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Marca todas as notificações do usuário como lidas
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificações marcadas como lidas
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
 *                     atualizadas:
 *                       type: integer
 *                       description: Número de notificações atualizadas
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
const marcarTodasComoLidas = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const result = await NotificacaoService.marcarTodasComoLidas(userId);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Erro ao marcar todas as notificações como lidas:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        next(error);
    }
};

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Envia uma notificação de teste para o usuário
 *     tags: [Notificações]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificação de teste enviada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
const enviarNotificacaoTeste = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Cria uma notificação de teste
        const notificacao = await NotificacaoService.criarNotificacao({
            usuario_id: userId,
            tipo: 'teste',
            titulo: 'Notificação de Teste',
            mensagem: 'Esta é uma notificação de teste para verificar o funcionamento do sistema.',
            dados_adicionais: {
                testId: Date.now(),
                source: 'teste',
                timestamp: new Date().toISOString()
            }
        });
        
        // Envia notificação em tempo real via WebSocket
        socketService.notificarUsuario(userId, 'nova_notificacao', notificacao);
        
        res.json({
            success: true,
            message: 'Notificação de teste enviada com sucesso',
            data: notificacao
        });
    } catch (error) {
        logger.error('Erro ao enviar notificação de teste:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.id
        });
        next(error);
    }
};

module.exports = {
    listarNotificacoes,
    listarNaoLidas,
    marcarComoLida,
    marcarTodasComoLidas,
    enviarNotificacaoTeste
};
