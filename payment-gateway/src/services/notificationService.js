const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const paymentModel = require('../models/paymentModel');
const mercadoPagoService = require('./mercadoPagoService');
const { AppError } = require('../utils/errors');

class NotificationService {
  /**
   * Processa uma notificação do Mercado Pago
   * @param {string} topic - Tipo de notificação (payment, merchant_order, etc.)
   * @param {string} id - ID do recurso (payment_id, merchant_order_id, etc.)
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processNotification(topic, id) {
    try {
      logger.info(`Processando notificação: ${topic} - ${id}`);

      // Verifica o tipo de notificação
      if (topic === 'payment') {
        return this.processPaymentNotification(id);
      } else if (topic === 'merchant_order') {
        return this.processMerchantOrderNotification(id);
      } else {
        logger.warn(`Tipo de notificação não suportado: ${topic}`);
        throw new AppError(`Tipo de notificação não suportado: ${topic}`, 400);
      }
    } catch (error) {
      logger.error('Erro ao processar notificação:', error);
      throw error;
    }
  }

  /**
   * Processa uma notificação de pagamento
   * @param {string} paymentId - ID do pagamento
   * @returns {Promise<Object>} Dados do pagamento processado
   */
  async processPaymentNotification(paymentId) {
    try {
      // Busca os dados do pagamento no Mercado Pago
      const payment = await mercadoPagoService.getPayment(paymentId);
      
      // Verifica se o pagamento já existe no banco de dados
      const existingPayment = await paymentModel.findById(paymentId);
      
      if (existingPayment) {
        // Atualiza o status do pagamento existente
        return paymentModel.updateStatus(
          paymentId, 
          payment.status,
          { 
            last_notification: new Date().toISOString(),
            raw_data: payment
          }
        );
      } else {
        // Cria um novo registro de pagamento
        return paymentModel.create({
          payment_id: payment.id,
          amount: payment.transaction_amount,
          description: payment.description || 'Pagamento sem descrição',
          status: payment.status,
          payment_method: payment.payment_type_id,
          payer_email: payment.payer?.email,
          merchant_order_id: payment.order?.id,
          external_reference: payment.external_reference,
          metadata: {
            raw_data: payment,
            last_notification: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      logger.error('Erro ao processar notificação de pagamento:', error);
      throw error;
    }
  }

  /**
   * Processa uma notificação de pedido do comerciante
   * @param {string} orderId - ID do pedido
   * @returns {Promise<Object>} Dados do pedido processado
   */
  async processMerchantOrderNotification(orderId) {
    try {
      // Implemente a lógica para processar notificações de pedidos do comerciante
      // Esta é uma implementação básica que pode ser expandida conforme necessário
      logger.info(`Processando notificação de pedido do comerciante: ${orderId}`);
      
      // Aqui você pode buscar os detalhes do pedido no Mercado Pago
      // e atualizar o status no seu banco de dados
      
      return { 
        success: true, 
        message: 'Notificação de pedido processada com sucesso',
        orderId 
      };
    } catch (error) {
      logger.error('Erro ao processar notificação de pedido:', error);
      throw error;
    }
  }

  /**
   * Verifica a assinatura HMAC de uma notificação
   * @param {string} payload - Corpo da requisição em formato de string
   * @param {string} signature - Assinatura HMAC
   * @param {string} secret - Chave secreta para validação
   * @returns {boolean} True se a assinatura for válida
   */
  verifySignature(payload, signature, secret) {
    try {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      return `sha256=${hash}` === signature;
    } catch (error) {
      logger.error('Erro ao verificar assinatura:', error);
      return false;
    }
  }

  /**
   * Envia uma notificação por e-mail (opcional)
   * @param {string} to - Endereço de e-mail do destinatário
   * @param {string} subject - Assunto do e-mail
   * @param {string} template - Nome do template de e-mail
   * @param {Object} data - Dados para preencher o template
   * @returns {Promise<Object>} Resultado do envio
   */
  async sendEmailNotification(to, subject, template, data = {}) {
    try {
      // Implemente a lógica para enviar e-mails de notificação
      // Esta é uma implementação básica que pode ser expandida
      logger.info(`Enviando e-mail para ${to} com assunto: ${subject}`);
      
      // Aqui você pode integrar com um serviço de e-mail como SendGrid, AWS SES, etc.
      
      return { 
        success: true, 
        message: 'E-mail enviado com sucesso',
        to,
        subject
      };
    } catch (error) {
      logger.error('Erro ao enviar notificação por e-mail:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();
