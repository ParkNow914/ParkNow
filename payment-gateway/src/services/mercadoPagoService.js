const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config');

class MercadoPagoService {
  constructor() {
    this.baseURL = 'https://api.mercadopago.com/v1';
    this.accessToken = config.mercadoPago.accessToken;
    this.platformAccountId = config.mercadoPago.platformAccountId; // ID da conta da plataforma
    this.platformFee = parseFloat(process.env.PLATFORM_FEE) || 20.00; // Taxa da plataforma em %
    
    if (!this.accessToken) {
      throw new Error('MP_ACCESS_TOKEN não configurado no ambiente');
    }
    
    this.axios = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': uuidv4()
      },
      timeout: 30000 // 30 segundos de timeout
    });
  }

  /**
   * Cria um pagamento no Mercado Pago com split
   * @param {Object} paymentData - Dados do pagamento
   * @param {string} idempotencyKey - Chave de idempotência
   * @returns {Promise<Object>} Resposta do Mercado Pago
   */
  async createPayment(paymentData, idempotencyKey) {
    try {
      const { 
        amount, 
        description, 
        payer, 
        paymentMethod, 
        installments, 
        token, 
        parkingId,
        parkingReceiverId,
        externalReference
      } = paymentData;

      // Validar dados de entrada
      if (!amount || amount <= 0) {
        throw new Error('Valor do pagamento inválido');
      }

      if (!parkingReceiverId) {
        throw new Error('ID do recebedor do estacionamento não fornecido');
      }

      // Calcular valores do split (80/20)
      const platformAmount = parseFloat((amount * (this.platformFee / 100)).toFixed(2));
      const parkingAmount = parseFloat((amount - platformAmount).toFixed(2));

      // Montar payload do pagamento
      const paymentPayload = {
        transaction_amount: parseFloat(amount),
        description: description || 'Pagamento de reserva',
        payment_method_id: paymentMethod,
        payer: {
          email: payer.email,
          first_name: payer.firstName || '',
          last_name: payer.lastName || '',
          identification: payer.identification ? {
            type: payer.identification.type,
            number: payer.identification.number
          } : undefined
        },
        installments: installments || 1,
        token: paymentMethod !== 'pix' ? token : undefined,
        notification_url: `${config.appUrl}/api/webhooks/mercadopago`,
        external_reference: externalReference || `reserva_${Date.now()}`,
        statement_descriptor: 'ParkNow*Estacionamento',
        binary_mode: true,
        // Configuração do split de pagamento
        split: [
          // Recebedor primário (estacionamento) - 80%
          {
            amount: parkingAmount,
            recipient_id: parkingReceiverId
          },
          // Recebedor secundário (plataforma) - 20%
          {
            amount: platformAmount,
            recipient_id: this.platformAccountId
          }
        ]
      };

      // Se for PIX, adiciona dados específicos
      if (paymentMethod === 'pix') {
        paymentPayload.payment_method = {
          installments: 1
        };
      }

      // Se for cartão, adiciona dados do token
      if (paymentMethod !== 'pix') {
        paymentPayload.token = token;
        paymentPayload.installments = installments || 1;
        paymentPayload.issuer_id = paymentData.issuerId;
      }

      const response = await this.axios.post('/payments', paymentPayload, {
        headers: {
          'X-Idempotency-Key': idempotencyKey || uuidv4()
        }
      });

      return {
        ...response.data,
        split_applied: true,
        platform_fee: this.platformFee,
        platform_amount: platformAmount,
        parking_amount: parkingAmount
      };

    } catch (error) {
      logger.error('Erro ao criar pagamento no Mercado Pago:', {
        error: error.response?.data || error.message,
        status: error.response?.status,
        request: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      
      const errorMessage = error.response?.data?.message || 'Erro ao processar pagamento';
      const errorStatus = error.response?.status || 500;
      
      throw new Error(`${errorMessage} (Status: ${errorStatus})`);
    }
  }

  /**
   * Busca um pagamento pelo ID
   * @param {string} paymentId - ID do pagamento
   * @returns {Promise<Object>} Dados do pagamento
   */
  async getPayment(paymentId) {
    try {
      const response = await this.axios.get(`/payments/${paymentId}`);
      return this.formatPaymentResponse(response.data);
    } catch (error) {
      logger.error('Erro ao buscar pagamento no Mercado Pago:', {
        paymentId,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error('Pagamento não encontrado');
    }
  }

  /**
   * Processa notificação de webhook do Mercado Pago
   * @param {Object} notification - Dados da notificação
   * @returns {Promise<Object>} Dados do pagamento processado
   */
  async processWebhook(notification) {
    try {
      // Verifica se é uma notificação de pagamento
      if (notification.type === 'payment') {
        const paymentId = notification.data.id;
        const payment = await this.getPayment(paymentId);
        
        // Retorna os dados do pagamento para atualização no banco de dados
        return {
          paymentId: payment.id,
          status: this.mapPaymentStatus(payment.status),
          statusDetail: payment.status_detail,
          amount: payment.transaction_amount,
          netAmount: payment.transaction_details?.net_received_amount,
          feeDetails: payment.fee_details,
          split: payment.split,
          metadata: {
            paymentMethod: payment.payment_method_id,
            paymentType: payment.payment_type_id,
            card: payment.card ? {
              lastFourDigits: payment.card.last_four_digits,
              brand: payment.card.payment_method?.name,
              expirationMonth: payment.card.expiration_month,
              expirationYear: payment.card.expiration_year,
              holderName: payment.card.cardholder.name
            } : null,
            pix: payment.point_of_interaction?.transaction_data?.qr_code ? {
              qrCode: payment.point_of_interaction.transaction_data.qr_code,
              qrCodeBase64: payment.point_of_interaction.transaction_data.qr_code_base64,
              ticketUrl: payment.point_of_interaction.transaction_data.ticket_url
            } : null
          }
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Erro ao processar webhook do Mercado Pago:', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Mapeia o status do Mercado Pago para o status interno
   * @param {string} status - Status do Mercado Pago
   * @returns {string} Status interno
   */
  mapPaymentStatus(status) {
    const statusMap = {
      'pending': 'pendente',
      'approved': 'aprovado',
      'authorized': 'autorizado',
      'in_process': 'em_processamento',
      'in_mediation': 'em_mediacao',
      'rejected': 'recusado',
      'cancelled': 'cancelado',
      'refunded': 'reembolsado',
      'charged_back': 'estornado'
    };
    
    return statusMap[status] || 'pendente';
  }

  /**
   * Formata os dados do pagamento para a resposta da API
   * @param {Object} payment - Dados do pagamento do Mercado Pago
   * @returns {Object} Dados formatados
   */
  formatPaymentResponse(payment) {
    if (!payment) return null;
    
    const response = {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      payment_method_id: payment.payment_method_id,
      payment_type_id: payment.payment_type_id,
      transaction_amount: payment.transaction_amount,
      date_created: payment.date_created,
      date_approved: payment.date_approved,
      date_last_updated: payment.date_last_updated,
      money_release_date: payment.money_release_date,
      payer: payment.payer,
      transaction_details: payment.transaction_details,
      fee_details: payment.fee_details,
      captured: payment.captured,
      binary_mode: payment.binary_mode,
      call_for_authorize_id: payment.call_for_authorize_id,
      statement_descriptor: payment.statement_descriptor,
      installments: payment.installments,
      card: payment.card,
      notification_url: payment.notification_url,
      external_reference: payment.external_reference,
      description: payment.description,
      metadata: payment.metadata,
      additional_info: payment.additional_info,
      order: payment.order,
      pos_id: payment.pos_id,
      pos: payment.pos,
      store_id: payment.store_id,
      store: payment.store,
      marketplace_owner: payment.marketplace_owner,
      currency_id: payment.currency_id,
      counter_currency: payment.counter_currency,
      shipping_amount: payment.shipping_amount,
      build_version: payment.build_version,
      pos_version: payment.pos_version,
      application_id: payment.application_id,
      payment_type: payment.payment_type,
      payment_method: payment.payment_method,
      taxes_amount: payment.taxes_amount,
      transaction_order: payment.transaction_order,
      operation_type: payment.operation_type,
      integrator_id: payment.integrator_id,
      platform_id: payment.platform_id,
      corporation_id: payment.corporation_id,
      collector_id: payment.collector_id,
      sponsor_id: payment.sponsor_id,
      marketplace: payment.marketplace,
      money_release_schema: payment.money_release_schema,
      point_of_interaction: payment.point_of_interaction,
      split: payment.split
    };

    return response;
  }
}

module.exports = new MercadoPagoService();
