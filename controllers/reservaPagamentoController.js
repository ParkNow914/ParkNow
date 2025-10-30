const reservaService = require('../services/reservaService');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

class ReservaPagamentoController {
  /**
   * Cria uma nova reserva com pagamento
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async criarReservaComPagamento(req, res, next) {
    try {
      const userId = req.user.id;
      const { 
        metodo_pagamento = 'pix',
        estacionamento_id,
        vaga_id,
        data_entrada,
        data_saida,
        valor,
        veiculo_placa,
        veiculo_modelo,
        observacoes
      } = req.body;
      
      // Valida o método de pagamento
      const metodosPermitidos = ['pix', 'credit_card', 'debit_card'];
      if (!metodosPermitidos.includes(metodo_pagamento)) {
        throw new AppError('Método de pagamento não suportado', 400);
      }

      // Valida campos obrigatórios
      if (!estacionamento_id || !vaga_id || !data_entrada || !data_saida || !valor) {
        throw new AppError('Campos obrigatórios não informados', 400);
      }
      
      // Prepara os dados da reserva
      const reservaData = {
        estacionamento_id,
        usuario_id: userId,
        vaga_id,
        data_entrada,
        data_saida,
        valor,
        veiculo_placa,
        veiculo_modelo,
        observacoes
      };
      
      // Cria a reserva com pagamento
      const resultado = await reservaService.criarReservaComPagamento(reservaData, metodo_pagamento);
      
      res.status(201).json({
        success: true,
        data: resultado,
        message: 'Reserva criada com sucesso. Realize o pagamento para confirmar.'
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Webhook para notificações de pagamento do Mercado Pago
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  /**
   * Webhook para notificações de pagamento
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async webhookPagamento(req, res, next) {
    try {
      // Implementação vazia pois o gateway de pagamento foi removido
      res.status(200).json({ success: true, message: 'Webhook recebido com sucesso' });
    } catch (error) {
      logger.error('Erro ao processar webhook de pagamento:', error);
      res.status(200).json({ success: true, error: error.message });
    }
  }
  
  /**
   * Consulta o status de um pagamento
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async consultarStatusPagamento(req, res, next) {
    try {
      const { id } = req.params;
      
      // Busca a reserva no banco de dados
      const reserva = await reservaService.obterReservaPorId(id);
      
      if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
      }
      
      res.status(200).json({
        success: true,
        data: {
          id: reserva.id,
          status: reserva.status_pagamento || 'pending',
          valor: reserva.valor,
          metodo_pagamento: reserva.metodo_pagamento || 'pix',
          data_criacao: reserva.data_criacao,
          data_atualizacao: reserva.data_atualizacao || new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Gera um novo QR Code para pagamento PIX
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async gerarNovoQRCode(req, res, next) {
    try {
      const { id } = req.params;
      
      // Atualiza a reserva com um novo ID de pagamento simbólico
      const novoIdPagamento = `pag_${Date.now()}`;
      await reservaService.atualizarIdPagamento(id, novoIdPagamento);
      
      res.status(200).json({
        success: true,
        data: {
          id: novoIdPagamento,
          qr_code: 'QR_CODE_SIMULADO',
          qr_code_base64: 'QR_CODE_BASE64_SIMULADO',
          ticket_url: '#'
        },
        message: 'QR Code simulado gerado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReservaPagamentoController();
