const { v4: uuidv4 } = require('uuid');
const mercadoPagoService = require('../services/mercadoPagoService');
const PaymentModel = require('../models/paymentModel');
const logger = require('../utils/logger');
const { AppError, ValidationError } = require('../utils/errors');
const { validatePaymentData } = require('../validations/paymentValidation');

class PaymentController {
  /**
   * Cria um novo pagamento com split
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async createPayment(req, res, next) {
    const transaction = await PaymentModel.startTransaction();
    
    try {
      const idempotencyKey = req.headers['idempotency-key'] || uuidv4();
      const userId = req.user?.id;
      
      // Validar dados de entrada
      const { error, value: paymentData } = validatePaymentData(req.body);
      if (error) {
        throw new ValidationError('Dados de pagamento inválidos', error.details);
      }

      const { 
        amount, 
        description, 
        paymentMethod, 
        installments = 1, 
        card, 
        payer,
        parkingId,
        parkingReceiverId,
        externalReference
      } = paymentData;

      // Verifica se já existe um pagamento com a mesma referência externa
      if (externalReference) {
        const existingPayment = await PaymentModel.findByExternalReference(externalReference, transaction);
        if (existingPayment) {
          return res.status(200).json(this.formatPaymentResponse(existingPayment));
        }
      }

      // Monta os dados para o Mercado Pago
      const mpPaymentData = {
        amount: parseFloat(amount),
        description: description.substring(0, 255),
        paymentMethod: paymentMethod === 'pix' ? 'pix' : paymentMethod,
        installments: parseInt(installments, 10) || 1,
        payer: {
          email: payer.email,
          firstName: payer.firstName,
          lastName: payer.lastName,
          identification: payer.identification
        },
        parkingId,
        parkingReceiverId,
        externalReference: externalReference || `reserva_${Date.now()}`,
        token: card?.token,
        issuerId: card?.issuerId
      };

      // Cria o pagamento no Mercado Pago
      const mercadoPagoPayment = await mercadoPagoService.createPayment(
        mpPaymentData, 
        idempotencyKey
      );

      // Salva o pagamento no banco de dados
      const payment = await PaymentModel.create({
        id: mercadoPagoPayment.id,
        external_reference: mpPaymentData.externalReference,
        user_id: userId,
        parking_id: parkingId,
        amount: parseFloat(amount),
        platform_amount: mercadoPagoPayment.platform_amount,
        parking_amount: mercadoPagoPayment.parking_amount,
        platform_fee: mercadoPagoPayment.platform_fee,
        payment_method: paymentMethod,
        status: mercadoPagoPayment.status,
        status_detail: mercadoPagoPayment.status_detail,
        metadata: {
          payer,
          card: paymentMethod !== 'pix' ? card : null,
          installments,
          split: mercadoPagoPayment.split,
          transaction_details: mercadoPagoPayment.transaction_details
        }
      }, { transaction });

      // Confirma a transação
      await transaction.commit();

      // Formata e retorna a resposta
      const response = this.formatPaymentResponse(payment);
      
      // Adiciona dados específicos do PIX se for o caso
      if (paymentMethod === 'pix' && mercadoPagoPayment.point_of_interaction?.transaction_data) {
        response.point_of_interaction = {
          qr_code: mercadoPagoPayment.point_of_interaction.transaction_data.qr_code,
          qr_code_base64: mercadoPagoPayment.point_of_interaction.transaction_data.qr_code_base64,
          ticket_url: mercadoPagoPayment.point_of_interaction.transaction_data.ticket_url
        };
      }

      res.status(201).json(response);
      
    } catch (error) {
      // Desfaz a transação em caso de erro
      await transaction.rollback();
      
      logger.error('Erro ao processar pagamento:', {
        error: error.message,
        stack: error.stack,
        request: {
          body: req.body,
          headers: req.headers,
          user: req.user
        }
      });
      
      next(error);
    }
  }

  /**
   * Processa notificação de webhook do Mercado Pago
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async processWebhook(req, res, next) {
    try {
      const signature = req.headers['x-signature'] || req.headers['x-signature-sha256'];
      const payload = req.body;
      
      if (!signature) {
        throw new AppError('Assinatura não fornecida', 401);
      }
      
      // Valida a assinatura do webhook
      const isValid = mercadoPagoService.validateWebhookSignature(signature, payload);
      if (!isValid) {
        throw new AppError('Assinatura inválida', 401);
      }
      
      // Processa a notificação
      const paymentUpdate = await mercadoPagoService.processWebhook(payload);
      
      if (paymentUpdate) {
        // Atualiza o status do pagamento no banco de dados
        await PaymentModel.updateStatus(
          paymentUpdate.paymentId,
          paymentUpdate.status,
          paymentUpdate.statusDetail,
          paymentUpdate.metadata
        );
        
        // Aqui você pode adicionar lógica adicional, como notificar o usuário,
        // atualizar o status da reserva, etc.
        
        logger.info(`Pagamento ${paymentUpdate.paymentId} atualizado para status: ${paymentUpdate.status}`);
      }
      
      res.status(200).json({ received: true });
      
    } catch (error) {
      logger.error('Erro ao processar webhook:', {
        error: error.message,
        stack: error.stack,
        headers: req.headers,
        body: req.body
      });
      
      next(error);
    }
  }

  /**
   * Busca um pagamento pelo ID
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async getPayment(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      
      if (!id) {
        throw new ValidationError('ID do pagamento não fornecido');
      }
      
      // Busca o pagamento no banco de dados
      const payment = await PaymentModel.findById(id);
      
      if (!payment) {
        throw new AppError('Pagamento não encontrado', 404);
      }
      
      // Verifica se o usuário tem permissão para ver este pagamento
      if (payment.user_id !== userId && !req.user?.isAdmin) {
        throw new AppError('Não autorizado', 403);
      }
      
      // Se o pagamento estiver pendente, verifica se houve atualização no Mercado Pago
      if (payment.status === 'pending' || payment.status === 'in_process') {
        try {
          const updatedPayment = await mercadoPagoService.getPayment(id);
          
          // Se o status for diferente, atualiza no banco de dados
          if (updatedPayment.status !== payment.status) {
            await PaymentModel.updateStatus(
              id,
              updatedPayment.status,
              updatedPayment.status_detail,
              { ...payment.metadata, ...updatedPayment.metadata }
            );
            
            // Atualiza o objeto de retorno
            payment.status = updatedPayment.status;
            payment.status_detail = updatedPayment.status_detail;
            payment.metadata = { ...payment.metadata, ...updatedPayment.metadata };
            payment.updated_at = new Date();
          }
        } catch (error) {
          // Se houver erro ao buscar no Mercado Pago, apenas registra e continua
          logger.error('Erro ao verificar status do pagamento no Mercado Pago:', {
            paymentId: id,
            error: error.message
          });
        }
      }
      
      res.json(this.formatPaymentResponse(payment));
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Lista os pagamentos de um usuário
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async listPayments(req, res, next) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 10, status, paymentMethod } = req.query;
      
      const filters = { user_id: userId };
      
      if (status) {
        filters.status = status;
      }
      
      if (paymentMethod) {
        filters.payment_method = paymentMethod;
      }
      
      const { payments, total } = await PaymentModel.findByFilters(filters, {
        page: parseInt(page, 10),
        limit: Math.min(parseInt(limit, 10), 50),
        order: [['created_at', 'DESC']]
      });
      
      res.json({
        data: payments.map(payment => this.formatPaymentResponse(payment)),
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Formata a resposta do pagamento
   * @param {Object} payment - Dados do pagamento
   * @returns {Object} Dados formatados
   */
  formatPaymentResponse(payment) {
    if (!payment) return null;
    
    return {
      id: payment.id,
      external_reference: payment.external_reference,
      amount: parseFloat(payment.amount),
      platform_amount: payment.platform_amount ? parseFloat(payment.platform_amount) : null,
      parking_amount: payment.parking_amount ? parseFloat(payment.parking_amount) : null,
      platform_fee: payment.platform_fee ? parseFloat(payment.platform_fee) : null,
      payment_method: payment.payment_method,
      status: payment.status,
      status_detail: payment.status_detail,
      created_at: payment.created_at,
      updated_at: payment.updated_at,
      paid_at: payment.paid_at,
      metadata: payment.metadata || {}
    };
  }
}

module.exports = new PaymentController();
