const reservaModel = require('../models/reservaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const emailService = require('../services/emailService');
const notificacaoService = require('../services/notificacaoService');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');
const db = require('../config/database');

class PixConfirmationController {
  /**
   * Obtém os dados do PIX para uma reserva
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async getPixDetails(req, res, next) {
    try {
      const { reservaId } = req.params;
      const usuarioId = req.user.id;

      // Busca a reserva
      const reserva = await reservaModel.findReservaById(reservaId);

      if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
      }

      // Verifica se o usuário tem permissão para ver esta reserva
      if (reserva.usuario_id !== usuarioId && reserva.estacionamento_usuario_id !== usuarioId) {
        throw new AppError('Não autorizado', 403);
      }

      // Busca os dados do PIX do estacionamento
      const configPagamento = await estacionamentoModel.buscarConfiguracaoPagamento(reserva.estacionamento_id);

      if (!configPagamento || !configPagamento.chave_pix) {
        throw new AppError('Estacionamento não configurado para receber PIX', 400);
      }

      // Retorna os dados do PIX
      res.json({
        success: true,
        data: {
          chave_pix: configPagamento.chave_pix,
          tipo_chave_pix: configPagamento.tipo_chave_pix,
          nome_titular: configPagamento.nome_titular,
          valor: reserva.valor,
          descricao: `Pagamento reserva #${reserva.id} - ${reserva.estacionamento_nome}`
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirma o recebimento de um pagamento PIX
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  /**
   * Notifica o estacionamento sobre uma ação de pagamento PIX
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async notificarPagamentoPix(req, res, next) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const { reservaId } = req.params;
      const { tipo, codigoPix } = req.body;
      const usuarioId = req.user.id;

      // Log da requisição recebida
      logger.info(`Notificação de pagamento PIX recebida`, {
        reservaId,
        tipo,
        usuarioId,
        body: req.body,
        timestamp: new Date().toISOString()
      });

      // Valida o tipo de notificação
      const tiposSuportados = ['pix_copiado', 'pix_visualizado', 'pagamento_confirmado'];
      if (!tipo || !tiposSuportados.includes(tipo)) {
        logger.warn(`Tipo de notificação inválido: ${tipo}`, {
          tiposSuportados,
          recebido: tipo
        });
        throw new AppError(`Tipo de notificação inválido. Tipos suportados: ${tiposSuportados.join(', ')}`, 400);
      }

      // Busca a reserva
      const reserva = await reservaModel.findReservaById(reservaId, client);

      if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
      }

      // Verifica se o usuário é o dono da reserva
      if (reserva.usuario_id !== usuarioId) {
        logger.warn(`Tentativa de acesso não autorizado à reserva ${reservaId} pelo usuário ${usuarioId}`);
        throw new AppError('Não autorizado', 403);
      }

      // Verifica se a reserva está dentro do prazo de 30 minutos
      const agora = new Date();
      const dataCriacao = new Date(reserva.data_criacao);
      const minutosDecorridos = (agora - dataCriacao) / (1000 * 60);
      const minutosLimite = parseInt(process.env.PIX_CONFIRMATION_TIMEOUT_MINUTES || '30');

      if (minutosDecorridos > minutosLimite) {
        logger.warn(`Tentativa de notificação fora do prazo para reserva ${reservaId}`, {
          minutosDecorridos: minutosDecorridos.toFixed(2),
          dataCriacao: dataCriacao.toISOString(),
          agora: agora.toISOString(),
          tipo,
          minutosLimite
        });
        throw new AppError(`O prazo para esta operação expirou (${minutosLimite} minutos)`, 400);
      }

      // Log antes de enviar notificação
      logger.info(`Enviando notificação para o estacionamento`, {
        reservaId: reserva.id,
        tipo,
        usuarioDestino: reserva.estacionamento_usuario_id
      });

      // Envia notificação para o estacionamento
      await notificacaoService.criarNotificacao({
        usuario_id: reserva.estacionamento_usuario_id,
        tipo: tipo === 'pix_copiado' ? 'pix_copiado' : tipo === 'pix_visualizado' ? 'pix_visualizado' : 'pagamento_confirmado',
        titulo: tipo === 'pix_copiado'
          ? 'Cliente copiou o código PIX'
          : tipo === 'pix_visualizado'
          ? 'Cliente visualizou o QR Code PIX'
          : 'Cliente confirmou pagamento PIX',
        mensagem: tipo === 'pix_copiado'
          ? `O cliente copiou o código PIX da reserva #${reserva.id}. O pagamento deve ser confirmado em breve.`
          : tipo === 'pix_visualizado'
          ? `O cliente visualizou o QR Code PIX da reserva #${reserva.id}.`
          : `O cliente confirmou o pagamento PIX da reserva #${reserva.id}. Por favor, verifique o recebimento.`,
        dados_adicionais: {
          reserva_id: reserva.id,
          tipo_evento: tipo,
          data_hora: new Date().toISOString()
        }
      }, client);

      // Se for uma cópia do código PIX, visualização ou confirmação de pagamento, envia e-mail para o estacionamento
      if (tipo === 'pix_copiado' || tipo === 'pix_visualizado') {
        // Busca os dados do estacionamento
        const estacionamento = await estacionamentoModel.buscarPorId(reserva.estacionamento_id, client);

        // Log da ação
        const acao = tipo === 'pix_copiado' ? 'copiado' : 'visualizado';
        logger.info(`Código PIX ${acao} para reserva ${reserva.id}`, {
          reservaId: reserva.id,
          estacionamentoId: reserva.estacionamento_id,
          usuarioId: reserva.usuario_id,
          tipo,
          timestamp: new Date().toISOString()
        });

        if (estacionamento && estacionamento.email) {
          // Formata os dados para o e-mail
          const dataHoraFormatada = new Date().toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const valorFormatado = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          }).format(reserva.valor);

          // URL para visualização da reserva (ajuste conforme sua rota)
          const urlReserva = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/reservas/${reserva.id}`;

          // Envia o e-mail de notificação
          await emailService.enviarEmailPixCopiado({
            to: estacionamento.email,
            estacionamentoNome: estacionamento.nome,
            clienteNome: reserva.usuario_nome || 'Cliente',
            veiculoPlaca: reserva.veiculo_placa || 'Não informada',
            reservaId: reserva.id,
            valor: valorFormatado,
            dataHora: dataHoraFormatada,
            codigoPix: req.body.codigoPix || 'Código não disponível',
            urlReserva
          });
        }
      } else if (tipo === 'pagamento_confirmado') {
        await this.enviarEmailConfirmacaoPagamento(reserva, client);
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        message: 'Notificação enviada com sucesso',
        data: {
          reserva_id: reserva.id,
          tipo_notificacao: tipo,
          data_hora: new Date().toISOString()
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Envia e-mail de confirmação de pagamento para o estacionamento
   * @param {Object} reserva - Dados da reserva
   * @param {Object} client - Cliente de banco de dados (opcional)
   */
  async enviarEmailConfirmacaoPagamento(reserva, client = null) {
    try {
      // Busca os dados do estacionamento
      const estacionamento = await estacionamentoModel.buscarPorId(reserva.estacionamento_id, client);

      if (!estacionamento || !estacionamento.email) {
        logger.warn(`Não foi possível enviar e-mail de confirmação: Estacionamento não encontrado ou sem e-mail cadastrado. Reserva ID: ${reserva.id}`);
        return;
      }

      // Formata os dados para o e-mail
      const emailData = {
        to: estacionamento.email,
        subject: `Pagamento PIX Recebido - Reserva #${reserva.id}`,
        template: 'pagamento_pix_recebido',
        context: {
          nome_estacionamento: estacionamento.nome,
          numero_reserva: reserva.id,
          data_hora: new Date(reserva.data_hora_reserva).toLocaleString('pt-BR'),
          valor: parseFloat(reserva.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          veiculo_placa: reserva.veiculo_placa,
          cliente_nome: reserva.usuario_nome,
          data_pagamento: new Date().toLocaleString('pt-BR')
        }
      };

      // Envia o e-mail
      await emailService.enviarEmail(emailData);

    } catch (error) {
      logger.error(`Erro ao enviar e-mail de confirmação de pagamento para o estacionamento: ${error.message}`, {
        reserva_id: reserva.id,
        error: error.stack
      });
      // Não propaga o erro para não interromper o fluxo principal
    }
  }

  /**
   * Confirma o recebimento de um pagamento PIX
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async confirmarPagamentoPix(req, res, next) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const { reservaId } = req.params;
      const { valorRecebido } = req.body;
      const usuarioId = req.user.id;

      // Log da requisição de confirmação de pagamento
      logger.info('Recebida confirmação de pagamento PIX', {
        reservaId,
        valorRecebido,
        usuarioId,
        timestamp: new Date().toISOString()
      });

      // Valida se o valor recebido é um número válido
      if (isNaN(parseFloat(valorRecebido)) || parseFloat(valorRecebido) <= 0) {
        throw new AppError('Valor de pagamento inválido', 400);
      }

      // Busca a reserva
      const reserva = await reservaModel.findReservaById(reservaId, client);

      if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
      }

      // Verifica se o usuário é o dono do estacionamento
      if (reserva.estacionamento_usuario_id !== usuarioId) {
        logger.warn(`Tentativa não autorizada de confirmar pagamento da reserva ${reservaId} pelo usuário ${usuarioId}`);
        throw new AppError('Não autorizado', 403);
      }

      // Verifica se o valor recebido é suficiente
      const valorEsperado = parseFloat(reserva.valor);
      const valorRecebidoFloat = parseFloat(valorRecebido);
      const diferenca = valorRecebidoFloat - valorEsperado;
      const tolerancia = 0.01; // 1 centavo de tolerância para arredondamentos

      if (isNaN(valorRecebidoFloat) || diferenca < -tolerancia) {
        logger.warn(`Valor insuficiente para a reserva ${reservaId}`, {
          valorEsperado,
          valorRecebido: valorRecebidoFloat,
          diferenca
        });
        throw new AppError(`Valor insuficiente. Valor esperado: R$ ${valorEsperado.toFixed(2)}`, 400);
      }

      // Log de confirmação de valores
      logger.info(`Valores validados para reserva ${reservaId}`, {
        valorEsperado,
        valorRecebido: valorRecebidoFloat,
        diferenca,
        status: 'Valor aceitável'
      });

      // Atualiza o status da reserva para confirmada
      await reservaModel.atualizarStatus(reservaId, 'confirmada', client);

      // Atualiza o status do pagamento
      await client.query(
        'UPDATE reservas SET status_pagamento = $1, data_pagamento = NOW() WHERE id = $2',
        ['paid', reservaId]
      );

      await client.query('COMMIT');

      // Envia email de confirmação para o cliente
      try {
        await emailService.enviarEmailConfirmacaoPagamento({
          to: reserva.usuario_email,
          pagamento: {
            id: reserva.id,
            transaction_amount: parseFloat(reserva.valor),
            payment_method_id: 'pix',
            date_approved: new Date().toISOString(),
            status: 'approved',
            status_detail: 'Pagamento confirmado via PIX'
          },
          reserva: {
            id: reserva.id,
            valor: parseFloat(reserva.valor),
            horario_inicio_reserva: reserva.horario_inicio_reserva,
            horario_fim_reserva: reserva.horario_fim_reserva,
            placa_veiculo: reserva.placa_veiculo,
            estacionamento: {
              nome: reserva.estacionamento_nome,
              endereco: reserva.estacionamento_endereco
            },
            vaga: {
              numero: reserva.vaga_numero
            }
          },
          usuario: {
            id: reserva.usuario_id,
            nome: reserva.usuario_nome,
            email: reserva.usuario_email
          }
        });
      } catch (emailError) {
        logger.error('Erro ao enviar email de confirmação de pagamento:', emailError);
      }

      res.json({
        success: true,
        message: 'Pagamento confirmado com sucesso',
        data: {
          reservaId: reserva.id,
          status: 'confirmada',
          statusPagamento: 'paid'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new PixConfirmationController();
