const db = require('../models');
const manualPixService = require('../services/manualPixService');
const emailService = require('../services/emailService');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

class ManualPixController {
  /**
   * Inicia o processo de pagamento PIX manual
   */
  async iniciarPagamento(req, res, next) {
    try {
      const userId = req.user.id;
      const reservaData = {
        ...req.body,
        usuario_id: userId
      };

      logger.info('Iniciando pagamento PIX manual', { 
        usuario_id: userId,
        estacionamento_id: reservaData.estacionamento_id 
      });

      const resultado = await manualPixService.iniciarPagamento(reservaData);
      
      res.status(200).json({
        success: true,
        data: resultado
      });
      
    } catch (error) {
      logger.error('Erro ao iniciar pagamento PIX manual:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Confirma o pagamento de uma reserva (chamado pelo dono do estacionamento)
   */
  async confirmarPagamento(req, res, next) {
    try {
      const { reservaId, codigoConfirmacao } = req.params;
      
      logger.info('Confirmando pagamento PIX manual', { 
        reservaId,
        codigoConfirmacao 
      });

      const reserva = await manualPixService.confirmarPagamento(reservaId, codigoConfirmacao);
      
      res.status(200).json({
        success: true,
        data: {
          reservaId: reserva.id,
          status: reserva.status,
          mensagem: 'Pagamento confirmado com sucesso!'
        }
      });
      
    } catch (error) {
      logger.error('Erro ao confirmar pagamento PIX manual:', {
        error: error.message,
        stack: error.stack,
        params: req.params
      });
      next(error);
    }
  }

  /**
   * Obtém o status de uma reserva
   */
  async verificarStatus(req, res, next) {
    try {
      const { reservaId } = req.params;
      const userId = req.user.id;
      
      logger.info('Verificando status do pagamento PIX', { 
        reservaId,
        userId 
      });

      const status = await manualPixService.verificarStatus(reservaId, userId);
      
      res.status(200).json({
        success: true,
        data: status
      });
      
    } catch (error) {
      logger.error('Erro ao verificar status do pagamento PIX:', {
        error: error.message,
        stack: error.stack,
        params: req.params
      });
      next(error);
    }
  }
  
  /**
   * Confirma que o usuário efetuou o pagamento PIX (chamado pelo frontend)
   */
  async confirmarPagamentoFrontend(req, res, next) {
    try {
      const userId = req.user.id;
      const { reservaId, estacionamentoId } = req.body;
      
      logger.info('Recebida confirmação de pagamento PIX do frontend', { 
        userId,
        reservaId,
        estacionamentoId
      });
      
      // Verificar se a reserva existe e pertence ao usuário
      const reserva = await db.Reserva.findOne({
        where: { 
          id: reservaId,
          usuario_id: userId,
          estacionamento_id: estacionamentoId,
          status: 'pendente'
        },
        include: [
          { model: db.Estacionamento, as: 'estacionamento' },
          { model: db.Usuario, as: 'usuario' }
        ]
      });
      
      if (!reserva) {
        throw new AppError('Reserva não encontrada ou já confirmada', 404);
      }
      
      // Verificar se o estacionamento tem PIX configurado
      if (!reserva.estacionamento.chave_pix || !reserva.estacionamento.email) {
        throw new AppError('Estacionamento não configurado para receber pagamentos PIX', 400);
      }
      
      // Atualizar status da reserva para aguardando confirmação
      await reserva.update({ 
        status: 'aguardando_confirmacao',
        status_pagamento: 'pendente',
        metodo_pagamento: 'pix_manual'
      });
      
      // Enviar e-mail para o dono do estacionamento
      try {
        await emailService.enviarEmailConfirmacaoPendente({
          email: reserva.estacionamento.email,
          nomeUsuario: reserva.usuario.nome || 'Cliente',
          nomeEstacionamento: reserva.estacionamento.nome,
          reservaId: reserva.id,
          dataHora: new Date().toLocaleString('pt-BR'),
          valor: reserva.valor,
          chavePix: reserva.estacionamento.chave_pix,
          codigoConfirmacao: `CFM-${Date.now()}-${reserva.id}`
        });
      } catch (emailError) {
        logger.error('Erro ao enviar e-mail de confirmação pendente:', {
          error: emailError.message,
          reservaId: reserva.id
        });
        // Não falhar o processo se o e-mail não for enviado
      }
      
      res.status(200).json({
        success: true,
        message: 'Pagamento confirmado. Aguarde a confirmação do estacionamento.',
        data: {
          reservaId: reserva.id,
          status: 'aguardando_confirmacao',
          statusPagamento: 'pendente',
          proximosPassos: [
            'Aguarde a confirmação do estacionamento',
            'Você receberá um e-mail quando o pagamento for confirmado',
            'O tempo estimado para confirmação é de até 1 hora'
          ]
        }
      });
      
    } catch (error) {
      logger.error('Erro ao confirmar pagamento PIX pelo frontend:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      next(error);
    }
  }
}

module.exports = new ManualPixController();
