const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

class NotificationController {
  /**
   * Processa uma notificação do Mercado Pago
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async handleNotification(req, res, next) {
    try {
      const { topic, id } = req.query;
      
      if (!topic || !id) {
        throw new AppError('Parâmetros de notificação inválidos', 400);
      }

      // Processa a notificação
      const result = await notificationService.processNotification(topic, id);
      
      // Retorna uma resposta de sucesso
      res.status(200).json({
        success: true,
        message: 'Notificação processada com sucesso',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Webhook para receber notificações do Mercado Pago
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async webhookHandler(req, res, next) {
    try {
      const signature = req.headers['x-signature'] || req.headers['x-signature-sha256'];
      const payload = JSON.stringify(req.body);
      
      // Valida a assinatura do webhook (opcional, mas recomendado)
      if (process.env.MP_WEBHOOK_SECRET) {
        const isValid = notificationService.verifySignature(
          payload,
          signature,
          process.env.MP_WEBHOOK_SECRET
        );

        if (!isValid) {
          logger.warn('Assinatura de webhook inválida');
          throw new AppError('Assinatura inválida', 401);
        }
      }

      const { action, type, data } = req.body;
      
      if (!action || !type || !data) {
        throw new AppError('Dados de notificação inválidos', 400);
      }

      logger.info(`Webhook recebido: ${type}.${action}`, { data });

      // Processa o webhook com base no tipo
      let result;
      switch (type) {
        case 'payment':
          result = await notificationService.processPaymentNotification(data.id);
          break;
        case 'merchant_order':
          result = await notificationService.processMerchantOrderNotification(data.id);
          break;
        default:
          logger.warn(`Tipo de webhook não suportado: ${type}`);
          result = { success: false, message: `Tipo de webhook não suportado: ${type}` };
      }

      // Retorna uma resposta de sucesso
      res.status(200).json({
        success: true,
        message: 'Webhook processado com sucesso',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
