const db = require('../utils/dbUtils');
const { v4: _uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const { findDefaultVehicleByUserId } = require('../models/usuarioModel');
const _pagamentoModel = require('../models/pagamentoModel');

class ReservaService {
  /**
   * Cria uma nova reserva e inicia o processo de pagamento
   * @param {Object} reservaData - Dados da reserva
   * @param {number} reservaData.estacionamento_id - ID do estacionamento
   * @param {number} reservaData.usuario_id - ID do usuário
   * @param {string} reservaData.data_entrada - Data de entrada
   * @param {string} reservaData.data_saida - Data de saída
   * @param {number} reservaData.valor - Valor total da reserva
   * @param {string} [reservaData.veiculo_placa] - Placa do veículo (opcional)
   * @param {string} [reservaData.veiculo_modelo] - Modelo do veículo (opcional)
   * @param {string} [reservaData.observacoes] - Observações adicionais (opcional)
   * @param {string} [metodoPagamento] - Método de pagamento (pix, credit_card, debit_card)
   * @returns {Promise<Object>} Reserva criada e dados do pagamento
   */
  async criarReservaComPagamento(reservaData, metodoPagamento = 'pix') {
    const client = await db.getClient();

    try {
      logger.info('Dados recebidos em criarReservaComPagamento:', {
        reservaData,
        metodoPagamento,
        hasEstacionamentoId: 'estacionamento_id' in reservaData,
        keys: Object.keys(reservaData)
      });
      await client.query('BEGIN');

      let {
        estacionamento_id,
        usuario_id,
        data_entrada: horario_inicio_reserva,
        data_saida: horario_fim_reserva,
        valor: valor_reserva,
        veiculo_placa: placa_veiculo,
        vaga_id
      } = reservaData;

      logger.info('Iniciando criação de reserva com pagamento', {
        estacionamento_id,
        usuario_id,
        horario_inicio_reserva,
        horario_fim_reserva,
        valor_reserva,
        vaga_id
      });

      // Busca a placa do veículo padrão do usuário se não fornecida
      if (!placa_veiculo) {
        const veiculoPadrao = await findDefaultVehicleByUserId(usuario_id, client);
        if (!veiculoPadrao) {
          throw new AppError('Nenhum veículo cadastrado. Por favor, cadastre um veículo antes de fazer uma reserva.', 400);
        }
        placa_veiculo = veiculoPadrao.placa_veiculo;
      }

      // Cria a reserva no banco de dados
      const reservaQuery = `
        INSERT INTO reservas (
          usuario_id,
          vaga_id,
          estacionamento_id,
          data_reserva,
          data_entrada_prevista,
          data_saida_prevista,
          status,
          valor_total,
          placa_veiculo,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const reservaValues = [
        usuario_id,
        vaga_id || null,
        estacionamento_id,
        new Date(), // data_reserva
        new Date(horario_inicio_reserva).toISOString(),
        new Date(horario_fim_reserva).toISOString(),
        'pendente',
        valor_reserva,
        placa_veiculo,
        new Date(), // created_at
        new Date()  // updated_at
      ];

      logger.debug('Criando reserva no banco de dados', { valores: reservaValues });

      const reservaResult = await client.query(reservaQuery, reservaValues);
      const reserva = reservaResult.rows[0];

      logger.info('Reserva criada com sucesso', { reserva_id: reserva.id, status: reserva.status });

      // Processar pagamento PIX usando o serviço de pagamento
      const paymentProcessingService = require('./estacionamentoPaymentProcessingService');

      logger.info('Processando pagamento PIX para reserva', {
        reserva_id: reserva.id,
        metodo: metodoPagamento,
        valor: valor_reserva
      });

      const resultadoPagamento = await paymentProcessingService.processarPagamento(
        reserva.id,
        metodoPagamento,
        {}, // dados_pagamento vazio para PIX
        client
      );

      logger.info('Pagamento PIX processado com sucesso', {
        reserva_id: reserva.id,
        pagamento_id: resultadoPagamento.pagamento_id,
        tem_qr_code: !!resultadoPagamento.qr_code
      });

      // Atualiza a reserva com o ID do pagamento
      const updateQuery = `
        UPDATE reservas
        SET id_pagamento = $1,
            updated_at = NOW(),
            status = 'pendente',
            status_pagamento = 'pendente'
        WHERE id = $2
        RETURNING *
      `;

      await client.query(updateQuery, [resultadoPagamento.pagamento_id, reserva.id]);

      // Commit da transação
      await client.query('COMMIT');

      logger.info('Reserva atualizada com sucesso', {
        reserva_id: reserva.id,
        payment_id: resultadoPagamento.pagamento_id
      });

      // Retorna os dados da reserva e pagamento com QR Code PIX REAL
      return {
        reserva: {
          ...reserva,
          id_pagamento: resultadoPagamento.pagamento_id,
          status_pagamento: 'pendente'
        },
        pagamento: {
          id: resultadoPagamento.pagamento_id,
          status: resultadoPagamento.status,
          metodo_pagamento: metodoPagamento
        },
        pix_qr_code: resultadoPagamento.qr_code,
        pix_qr_code_text: resultadoPagamento.qr_code_text,
        chave_pix: resultadoPagamento.chave_pix,
        nome_titular: resultadoPagamento.nome_titular,
        valor: resultadoPagamento.valor,
        expira_em: resultadoPagamento.expira_em
      };
    } catch (error) {
      // Rollback em caso de erro
      await client.query('ROLLBACK');
      logger.error('Erro ao criar reserva com pagamento:', {
        error: error.message,
        stack: error.stack,
        reservaData,
        metodoPagamento
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Falha ao processar a reserva: ${error.message || 'Erro desconhecido'}`,
        500
      );
    } finally {
      // Libera o cliente de volta para o pool
      client.release();
    }
  }

  /**
   * Atualiza o status de uma reserva com base no status do pagamento
   * @param {string} paymentId - ID do pagamento no sistema
   * @param {string} status - Novo status do pagamento
   * @returns {Promise<Object>} Reserva atualizada
   */
  async atualizarStatusPorPagamento(paymentId, status) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Primeiro, busca a reserva pelo ID do pagamento
      const reservaResult = await client.query(
        'SELECT * FROM reservas WHERE id_pagamento = $1',
        [paymentId]
      );

      if (reservaResult.rows.length === 0) {
        throw new AppError('Reserva não encontrada para o pagamento informado', 404);
      }

      const reserva = reservaResult.rows[0];

      // Define o status da reserva com base no status do pagamento
      let novoStatus;
      switch (status.toLowerCase()) {
        case 'approved':
        case 'paid':
          novoStatus = 'confirmada';
          break;
        case 'pending':
          novoStatus = 'pendente_pagamento';
          break;
        case 'cancelled':
        case 'rejected':
        case 'refunded':
          novoStatus = 'cancelada';
          break;
        default:
          novoStatus = 'pendente_pagamento';
      }

      // Atualiza a reserva
      const updateResult = await client.query(
        `UPDATE reservas
         SET status = $1,
             data_atualizacao = NOW()
         WHERE id = $2
         RETURNING *`,
        [novoStatus, reserva.id]
      );

      const reservaAtualizada = updateResult.rows[0];

      await client.query('COMMIT');

      logger.info('Status da reserva atualizado com sucesso', {
        reserva_id: reservaAtualizada.id,
        status_anterior: reserva.status,
        novo_status: reservaAtualizada.status,
        payment_id: paymentId
      });

      return reservaAtualizada;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao atualizar status da reserva por pagamento:', {
        error: error.message,
        stack: error.stack,
        paymentId,
        status
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Falha ao atualizar status da reserva: ${error.message || 'Erro desconhecido'}`,
        500
      );

    } finally {
      client.release();
    }
  }

  /**
   * Obtém os detalhes de uma reserva pelo ID do pagamento
   * @param {string} paymentId - ID do pagamento
   * @returns {Promise<Object>} Detalhes da reserva e do pagamento
   */
  async obterReservaPorPagamento(paymentId) {
    const client = await db.getClient();

    try {
      // Busca a reserva pelo ID do pagamento
      const reservaResult = await client.query(
        `SELECT r.*,
                e.nome as estacionamento_nome,
                e.endereco as estacionamento_endereco,
                e.telefone as estacionamento_telefone,
                u.nome as usuario_nome,
                u.email as usuario_email
         FROM reservas r
         JOIN estacionamentos e ON r.estacionamento_id = e.id
         JOIN usuarios u ON r.usuario_id = u.id
         WHERE r.id_pagamento = $1`,
        [paymentId]
      );

      if (reservaResult.rows.length === 0) {
        throw new AppError('Reserva não encontrada para o pagamento informado', 404);
      }

      const reserva = reservaResult.rows[0];

      // Formata os dados de retorno
      return {
        id: reserva.id,
        status: reserva.status,
        data_entrada: reserva.data_entrada_prevista,
        data_saida: reserva.data_saida_prevista,
        valor: reserva.valor_total,
        veiculo_placa: reserva.placa_veiculo,
        data_criacao: reserva.created_at,
        data_atualizacao: reserva.updated_at,
        estacionamento: {
          id: reserva.estacionamento_id,
          nome: reserva.estacionamento_nome,
          endereco: reserva.estacionamento_endereco,
          telefone: reserva.estacionamento_telefone
        },
        usuario: {
          id: reserva.usuario_id,
          nome: reserva.usuario_nome,
          email: reserva.usuario_email
        },
        pagamento: {
          id: reserva.id_pagamento,
          status: reserva.status_pagamento || 'pending'
        }
      };
    } catch (error) {
      logger.error('Erro ao obter reserva por pagamento:', {
        error: error.message,
        stack: error.stack,
        paymentId
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Falha ao obter reserva: ${error.message || 'Erro desconhecido'}`,
        500
      );
    } finally {
      client.release();
    }
  }

  /**
   * Cria uma reserva simples sem processar pagamento
   * (Para uso com gateways externos como ASAAS)
   * @param {Object} reservaData - Dados da reserva
   * @returns {Promise<Object>} Reserva criada
   */
  async criarReserva(reservaData) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      logger.info('Criando reserva simples (sem processamento de pagamento interno):', reservaData);

      // Buscar veículo padrão se placa não fornecida
      let placa_veiculo = reservaData.placa_veiculo;
      if (!placa_veiculo && reservaData.usuario_id) {
        const veiculoPadrao = await findDefaultVehicleByUserId(reservaData.usuario_id, client);
        if (veiculoPadrao) {
          placa_veiculo = veiculoPadrao.placa;
        }
      }

      // Criar reserva
      const insertQuery = `
        INSERT INTO reservas (
          usuario_id,
          estacionamento_id,
          vaga_id,
          data_reserva,
          data_entrada_prevista,
          data_saida_prevista,
          valor_total,
          placa_veiculo,
          status,
          status_pagamento,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        reservaData.usuario_id,
        reservaData.estacionamento_id,
        reservaData.vaga_id || null,
        new Date(), // data_reserva = agora
        reservaData.data_entrada_prevista || reservaData.data_entrada,
        reservaData.data_saida_prevista || reservaData.data_saida,
        reservaData.valor_total || reservaData.valor,
        placa_veiculo,
        reservaData.status || 'pendente',
        reservaData.status_pagamento || 'pendente',
      ];

      const result = await client.query(insertQuery, values);
      const reserva = result.rows[0];

      // Atualizar vaga se fornecida
      if (reservaData.vaga_id) {
        await client.query(
          `UPDATE vagas SET status = 'reservada' WHERE id = $1`,
          [reservaData.vaga_id]
        );
      }

      await client.query('COMMIT');

      logger.info('Reserva criada com sucesso:', { id: reserva.id });

      return reserva;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao criar reserva:', error);

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Falha ao criar reserva: ${error.message || 'Erro desconhecido'}`,
        500
      );
    } finally {
      client.release();
    }
  }
}

module.exports = new ReservaService();
