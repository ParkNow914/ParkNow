const db = require('../utils/dbUtils');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const emailService = require('./emailService');

class ManualPixService {
  /**
   * Inicia o processo de pagamento via PIX manual
   * @param {Object} reservaData - Dados da reserva
   * @returns {Promise<Object>} Dados para pagamento
   */
  async iniciarPagamento(reservaData) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Buscar dados do estacionamento
      const estacionamento = await client.query(
        'SELECT id, nome, chave_pix, email FROM estacionamentos WHERE id = $1',
        [reservaData.estacionamento_id]
      );
      
      if (estacionamento.rows.length === 0) {
        throw new AppError('Estacionamento não encontrado', 404);
      }
      
      const estacionamentoInfo = estacionamento.rows[0];
      
      if (!estacionamentoInfo.chave_pix || !estacionamentoInfo.email) {
        throw new AppError('Estacionamento não configurado para receber pagamentos PIX', 400);
      }
      
      // 2. Criar reserva com status 'aguardando_pagamento'
      const reservaResult = await client.query(
        `INSERT INTO reservas (
          usuario_id, vaga_id, estacionamento_id, data_reserva,
          data_entrada_prevista, data_saida_prevista, status,
          valor_total, placa_veiculo, status_pagamento, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *`,
        [
          reservaData.usuario_id,
          reservaData.vaga_id || null,
          reservaData.estacionamento_id,
          new Date(),
          new Date(reservaData.data_entrada).toISOString(),
          new Date(reservaData.data_saida).toISOString(),
          'aguardando_pagamento',
          reservaData.valor,
          reservaData.veiculo_placa,
          'pendente'
        ]
      );
      
      const reserva = reservaResult.rows[0];
      
      // 3. Gerar código de confirmação
      const codigoConfirmacao = uuidv4().substring(0, 8).toUpperCase();
      
      // 4. Enviar email para o dono do estacionamento
      await emailService.enviarEmailConfirmacaoPendente({
        para: estacionamentoInfo.email,
        dados: {
          nomeEstacionamento: estacionamentoInfo.nome,
          codigoReserva: reserva.id,
          codigoConfirmacao,
          valor: reservaData.valor,
          dataHora: new Date().toLocaleString('pt-BR'),
          placaVeiculo: reservaData.veiculo_placa,
          periodo: `${new Date(reservaData.data_entrada).toLocaleString('pt-BR')} - ${new Date(reservaData.data_saida).toLocaleString('pt-BR')}`
        }
      });
      
      // 5. Salvar código de confirmação na reserva
      await client.query(
        'UPDATE reservas SET metadata = jsonb_build_object($1, $2) WHERE id = $3',
        ['codigo_confirmacao', codigoConfirmacao, reserva.id]
      );
      
      await client.query('COMMIT');
      
      return {
        reservaId: reserva.id,
        chavePix: estacionamentoInfo.chave_pix,
        valor: reservaData.valor,
        codigoConfirmacao,
        mensagem: 'Aguardando confirmação de pagamento. O proprietário do estacionamento foi notificado.'
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao iniciar pagamento PIX manual:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Confirma o pagamento de uma reserva
   * @param {string} reservaId - ID da reserva
   * @param {string} codigoConfirmacao - Código de confirmação
   * @returns {Promise<Object>} Reserva atualizada
   */
  async confirmarPagamento(reservaId, codigoConfirmacao) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Buscar a reserva
      const reservaResult = await client.query(
        'SELECT * FROM reservas WHERE id = $1',
        [reservaId]
      );
      
      if (reservaResult.rows.length === 0) {
        throw new AppError('Reserva não encontrada', 404);
      }
      
      const reserva = reservaResult.rows[0];
      
      // 2. Verificar se o código de confirmação está correto
      if (reserva.metadata?.codigo_confirmacao !== codigoConfirmacao) {
        throw new AppError('Código de confirmação inválido', 400);
      }
      
      // 3. Atualizar status da reserva
      const updateResult = await client.query(
        `UPDATE reservas 
         SET status = 'confirmada', 
             status_pagamento = 'pago',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [reservaId]
      );
      
      const reservaAtualizada = updateResult.rows[0];
      
      // 4. Atualizar status da vaga se necessário
      if (reservaAtualizada.vaga_id) {
        await client.query(
          'UPDATE vagas SET status = $1 WHERE id = $2',
          ['reservada', reservaAtualizada.vaga_id]
        );
      }
      
      await client.query('COMMIT');
      
      logger.info('Pagamento PIX confirmado com sucesso', { reservaId });
      
      return reservaAtualizada;
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao confirmar pagamento PIX:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Verifica o status de uma reserva
   * @param {string} reservaId - ID da reserva
   * @returns {Promise<Object>} Status da reserva
   */
  async verificarStatus(reservaId) {
    const client = await db.getClient();
    
    try {
      const result = await client.query(
        'SELECT id, status, status_pagamento FROM reservas WHERE id = $1',
        [reservaId]
      );
      
      if (result.rows.length === 0) {
        throw new AppError('Reserva não encontrada', 404);
      }
      
      const reserva = result.rows[0];
      
      return {
        reservaId: reserva.id,
        status: reserva.status,
        statusPagamento: reserva.status_pagamento,
        pago: reserva.status_pagamento === 'pago'
      };
      
    } catch (error) {
      logger.error('Erro ao verificar status da reserva:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new ManualPixService();
