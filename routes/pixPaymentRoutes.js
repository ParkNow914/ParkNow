const express = require('express');
const router = express.Router();
const pixPaymentController = require('../controllers/pixPaymentController');
const { protectUser } = require('../middleware/authMiddleware');
const { deprecate } = require('../middleware/deprecation');

// Estas rotas usam tokens enviados por email — mantidas como fluxo alternativo
// ao painel admin. Recomendamos `/api/reservas/com-pagamento` + confirmação via
// painel (`POST /api/admin/reservas/:id/confirmar-pagamento`).
router.use(deprecate({
    replacement: '/api/reservas/com-pagamento',
    sunset: '2027-01-01',
    docs: '/api/docs',
}));

/**
 * @swagger
 * tags:
 *   name: Pagamento PIX
 *   description: Endpoints para gerenciar pagamentos via PIX
 */

/**
 * @swagger
 * /api/reservas/{reservaId}/notificar-pix:
 *   post:
 *     summary: Notifica o estacionamento sobre um pagamento PIX
 *     tags: [Pagamento PIX]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo
 *               - codigoPix
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [pix_copiado]
 *                 description: Tipo de notificação (sempre 'pix_copiado' para esta rota)
 *               codigoPix:
 *                 type: string
 *                 description: Código PIX copiado pelo cliente
 *     responses:
 *       200:
 *         description: Notificação de pagamento PIX enviada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     reserva_id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [aguardando_confirmacao]
 */
router.post('/reservas/:reservaId/notificar-pix', 
  protectUser, 
  pixPaymentController.notificarPagamentoPix
);

/**
 * @swagger
 * /api/reservas/{reservaId}/confirmar-pagamento:
 *   get:
 *     summary: Confirma o recebimento de um pagamento PIX (chamado pelo link no e-mail)
 *     tags: [Pagamento PIX]
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token de confirmação enviado por e-mail
 *     responses:
 *       302:
 *         description: Redireciona para a página de confirmação
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "http://frontend.com/admin/reservas/123?status=pagamento_confirmado"
 *       400:
 *         description: Token não fornecido ou inválido
 *       401:
 *         description: Token inválido ou expirado
 *       404:
 *         description: Reserva não encontrada
 */
router.get('/reservas/:reservaId/confirmar-pagamento', 
  pixPaymentController.confirmarPagamentoPix
);

/**
 * @swagger
 * /api/reservas/{reservaId}/cancelar-reserva:
 *   get:
 *     summary: Cancela uma reserva por falta de pagamento (chamado pelo link no e-mail)
 *     tags: [Pagamento PIX]
 *     parameters:
 *       - in: path
 *         name: reservaId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da reserva
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token de cancelamento enviado por e-mail
 *     responses:
 *       302:
 *         description: Redireciona para a página de cancelamento
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "http://frontend.com/admin/reservas/123?status=reserva_cancelada"
 *       400:
 *         description: Token não fornecido ou inválido
 *       401:
 *         description: Token inválido ou expirado
 *       404:
 *         description: Reserva não encontrada
 */
router.get('/reservas/:reservaId/cancelar-reserva', 
  pixPaymentController.cancelarReservaPix
);

/**
 * @swagger
 * /api/cron/verificar-reservas-expiradas:
 *   post:
 *     summary: Tarefa agendada para verificar e cancelar reservas com pagamento PIX expirado
 *     tags: [Pagamento PIX]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Processamento de reservas expiradas concluído
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 reservasProcessadas:
 *                   type: integer
 *                   description: Número de reservas processadas
 *                 mensagem:
 *                   type: string
 */
router.post('/cron/verificar-reservas-expiradas', 
  (req, res, next) => {
    // Middleware para validar chave de API (simplificado)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.CRON_API_KEY) {
      return res.status(401).json({ 
        success: false, 
        message: 'Não autorizado' 
      });
    }
    next();
  },
  pixPaymentController.verificarReservasExpiradas
);

module.exports = router;
