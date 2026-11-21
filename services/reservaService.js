const db = require('../utils/dbUtils');
const { v4: _uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { AppError, BadRequestError, ConflictError, NotFoundError } = require('../utils/AppError');
const { findDefaultVehicleByUserId } = require('../models/usuarioModel');
const { calcularValorReserva } = require('../utils/pricing');

// Status de reserva que ocupam a vaga no período reservado.
const STATUS_RESERVA_ATIVOS = [
  'pendente',
  'pendente_pagamento',
  'pagamento_aprovado',
  'confirmada',
  'ativa',
  'em_andamento',
];
const TOLERANCIA_ENTRADA_PASSADO_MS = 5 * 60 * 1000;      // relógio do cliente adiantado/atrasado
const ANTECEDENCIA_MAXIMA_MS = 90 * 24 * 60 * 60 * 1000;   // 90 dias
const DURACAO_MAXIMA_MS = 30 * 24 * 60 * 60 * 1000;        // 30 dias
const PLACA_REGEX = /^([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/;

class ReservaService {
  /**
   * Cria reserva + cobrança PIX numa única transação.
   *
   * - O valor é calculado aqui, pela tabela de preços do estacionamento.
   * - A vaga é travada (FOR UPDATE), precisa pertencer ao estacionamento,
   *   estar livre e não ter outra reserva ativa sobreposta no período.
   * - Sem `vagaId`, aloca a primeira vaga livre sem conflito.
   *
   * @param {object} p
   * @param {number} p.usuarioId
   * @param {number} p.estacionamentoId
   * @param {number|null} p.vagaId
   * @param {Date} p.entrada
   * @param {Date} p.saida
   * @param {string|null} p.placa
   * @param {string|null} p.modelo
   * @param {object} p.paymentProcessingService  serviço que gera o PIX (injeção evita import circular)
   */
  async criarReservaComPix({ usuarioId, estacionamentoId, vagaId, entrada, saida, placa, paymentProcessingService }) {
    const agora = Date.now();
    if (!(entrada instanceof Date) || Number.isNaN(entrada.getTime())) {
      throw new BadRequestError('Data de entrada inválida.');
    }
    if (!(saida instanceof Date) || Number.isNaN(saida.getTime())) {
      throw new BadRequestError('Data de saída inválida.');
    }
    if (entrada.getTime() < agora - TOLERANCIA_ENTRADA_PASSADO_MS) {
      throw new BadRequestError('A entrada não pode estar no passado.');
    }
    if (entrada.getTime() > agora + ANTECEDENCIA_MAXIMA_MS) {
      throw new BadRequestError('Reservas podem ser feitas com até 90 dias de antecedência.');
    }
    if (saida.getTime() <= entrada.getTime()) {
      throw new BadRequestError('A saída precisa ser depois da entrada.');
    }
    if (saida.getTime() - entrada.getTime() > DURACAO_MAXIMA_MS) {
      throw new BadRequestError('A duração máxima de uma reserva é de 30 dias.');
    }

    const entradaIso = entrada.toISOString();
    const saidaIso = saida.toISOString();
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const { rows: estRows } = await client.query(
        `SELECT id, nome, status, cidade, chave_pix,
                preco_hora, preco_dia, valor_hora, valor_diaria
           FROM estacionamentos
          WHERE id = $1
          FOR SHARE`,
        [estacionamentoId]
      );
      const estacionamento = estRows[0];
      if (!estacionamento) throw new NotFoundError('Estacionamento não encontrado.');
      if (['inativo', 'suspenso', 'bloqueado'].includes(String(estacionamento.status || '').toLowerCase())) {
        throw new ConflictError('Este estacionamento não está aceitando reservas no momento.');
      }
      if (!estacionamento.chave_pix) {
        throw new BadRequestError('Este estacionamento ainda não configurou uma chave PIX para receber pagamentos.');
      }

      let preco;
      try {
        preco = calcularValorReserva({ entrada, saida, estacionamento });
      } catch (e) {
        throw new BadRequestError(e.message);
      }

      // Vaga: escolhida pelo usuário ou alocada automaticamente.
      let vaga;
      if (vagaId) {
        const { rows } = await client.query(
          `SELECT id, numero, status, estacionamento_id FROM vagas WHERE id = $1 FOR UPDATE`,
          [vagaId]
        );
        vaga = rows[0];
        if (!vaga || Number(vaga.estacionamento_id) !== Number(estacionamentoId)) {
          throw new NotFoundError('Vaga não encontrada neste estacionamento.');
        }
        if (vaga.status !== 'livre') {
          throw new ConflictError('Esta vaga não está disponível. Escolha outra vaga.');
        }
      } else {
        const { rows } = await client.query(
          `SELECT v.id, v.numero, v.status, v.estacionamento_id
             FROM vagas v
            WHERE v.estacionamento_id = $1
              AND v.status = 'livre'
              AND NOT EXISTS (
                    SELECT 1 FROM reservas r
                     WHERE r.vaga_id = v.id
                       AND r.status = ANY($2::varchar[])
                       AND r.data_entrada_prevista < $4
                       AND r.data_saida_prevista > $3)
            ORDER BY v.numero
            LIMIT 1
            FOR UPDATE OF v SKIP LOCKED`,
          [estacionamentoId, STATUS_RESERVA_ATIVOS, entradaIso, saidaIso]
        );
        vaga = rows[0];
        if (!vaga) throw new ConflictError('Não há vagas livres neste estacionamento para o período escolhido.');
      }

      const { rows: conflitos } = await client.query(
        `SELECT id FROM reservas
          WHERE vaga_id = $1
            AND status = ANY($2::varchar[])
            AND data_entrada_prevista < $4
            AND data_saida_prevista > $3
          LIMIT 1`,
        [vaga.id, STATUS_RESERVA_ATIVOS, entradaIso, saidaIso]
      );
      if (conflitos.length) {
        throw new ConflictError('Já existe uma reserva para esta vaga no período escolhido.');
      }

      // Placa: a informada ou a do cadastro do usuário.
      let placaFinal = placa ? String(placa).replace(/[^A-Za-z0-9]/g, '').toUpperCase() : null;
      if (!placaFinal) {
        const veiculoPadrao = await findDefaultVehicleByUserId(usuarioId, client).catch(() => null);
        placaFinal = veiculoPadrao?.placa || null;
      }
      if (!placaFinal) {
        const { rows } = await client.query('SELECT placa_veiculo FROM usuarios WHERE id = $1', [usuarioId]);
        placaFinal = rows[0]?.placa_veiculo ? String(rows[0].placa_veiculo).toUpperCase() : null;
      }
      if (!placaFinal || !PLACA_REGEX.test(placaFinal)) {
        throw new BadRequestError('Informe uma placa válida (padrão antigo ou Mercosul) no seu perfil.');
      }

      const { rows: reservaRows } = await client.query(
        `INSERT INTO reservas (
            usuario_id, estacionamento_id, vaga_id, data_reserva,
            data_entrada_prevista, data_saida_prevista, valor_total,
            placa_veiculo, status, status_pagamento, created_at, updated_at
         ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, 'pendente_pagamento', 'pendente', NOW(), NOW())
         RETURNING *`,
        [usuarioId, estacionamentoId, vaga.id, entradaIso, saidaIso, preco.valor, placaFinal]
      );
      const reserva = reservaRows[0];

      const upd = await client.query(
        `UPDATE vagas SET status = 'reservada', updated_at = NOW() WHERE id = $1 AND status = 'livre'`,
        [vaga.id]
      );
      if (upd.rowCount !== 1) {
        throw new ConflictError('Esta vaga acabou de ser reservada por outra pessoa. Tente novamente.');
      }

      const pix = await paymentProcessingService.processarPagamentoPix(
        reserva,
        estacionamento,
        preco.valor,
        {},
        client
      );

      await client.query('COMMIT');

      logger.info('Reserva com PIX criada', {
        reserva_id: reserva.id,
        estacionamento_id: estacionamentoId,
        vaga_id: vaga.id,
        valor_centavos: preco.centavos,
      });

      return { reserva, vaga, estacionamento, preco, pix };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error && error.code === '23P01') {
        // exclusion constraint do banco (reserva sobreposta criada em paralelo)
        throw new ConflictError('Já existe uma reserva para esta vaga no período escolhido.');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Compatibilidade com a API antiga do serviço (usada pelos testes de
   * integração). Delega ao fluxo seguro criarReservaComPix: o valor enviado
   * em reservaData.valor / valor_total é IGNORADO e recalculado no servidor.
   * @param {Object} reservaData - estacionamento_id, usuario_id, vaga_id, data_entrada, data_saida, veiculo_placa
   * @param {string} metodoPagamento - só 'pix' é aceito
   */
  async criarReservaComPagamento(reservaData, metodoPagamento = 'pix') {
    if (metodoPagamento !== 'pix') {
      throw new BadRequestError('No momento só aceitamos pagamento via PIX.');
    }
    const paymentProcessingService = require('./estacionamentoPaymentProcessingService');
    const { reserva, preco, pix } = await this.criarReservaComPix({
      usuarioId: reservaData.usuario_id,
      estacionamentoId: reservaData.estacionamento_id,
      vagaId: reservaData.vaga_id || null,
      entrada: new Date(reservaData.data_entrada_prevista || reservaData.data_entrada),
      saida: new Date(reservaData.data_saida_prevista || reservaData.data_saida),
      placa: reservaData.veiculo_placa || reservaData.placa_veiculo || null,
      paymentProcessingService,
    });

    return {
      reserva: { ...reserva, id_pagamento: pix.pagamento_id, status_pagamento: 'pendente' },
      pagamento: { id: pix.pagamento_id, status: pix.status, metodo_pagamento: 'pix' },
      pix_qr_code: pix.qr_code,
      pix_qr_code_text: pix.qr_code_text,
      chave_pix: pix.chave_pix,
      nome_titular: pix.nome_titular,
      valor: preco.valor,
      expira_em: pix.expira_em,
    };
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
