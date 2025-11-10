const reservaService = require('../services/reservaService');
const pagamentoModel = require('../models/pagamentoModel');
const reservaModel = require('../models/reservaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
// const mercadoPagoMarketplace = require('../services/mercadoPagoMarketplaceService'); // DESATIVADO
const asaasMarketplace = require('../services/asaasMarketplaceService'); // ✅ ASAAS
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
      const userEmail = req.user.email;
      const {
        metodo_pagamento = 'pix',
        estacionamento_id,
        vaga_id,
        data_entrada,
        data_saida,
        valor,
        veiculo_placa,
        veiculo_modelo
      } = req.body;

      logger.info('Criando reserva com pagamento (marketplace):', {
        userId,
        userEmail,
        email_presente: !!userEmail,
        req_user: req.user,
        estacionamento_id,
        metodo_pagamento,
        valor
      });

      // Valida o método de pagamento
      const metodosPermitidos = ['pix', 'credit_card', 'debit_card'];
      if (!metodosPermitidos.includes(metodo_pagamento)) {
        throw new AppError('Método de pagamento não suportado', 400);
      }

      // Valida campos obrigatórios
      if (!estacionamento_id || !data_entrada || !data_saida || !valor) {
        throw new AppError('Campos obrigatórios não informados', 400);
      }

      // Busca dados do estacionamento
      const estacionamento = await estacionamentoModel.findById(estacionamento_id);
      
      logger.debug('Estacionamento encontrado:', {
        id: estacionamento?.id,
        nome: estacionamento?.nome,
        asaas_wallet_id: estacionamento?.asaas_wallet_id
      });
      
      if (!estacionamento) {
        throw new AppError('Estacionamento não encontrado', 404);
      }

      // Verifica se o estacionamento tem conta ASAAS vinculada
      if (!estacionamento.asaas_wallet_id) {
        logger.warn('Estacionamento sem conta ASAAS vinculada:', {
          estacionamento_id,
          nome: estacionamento.nome
        });
        
        throw new AppError(
          'Este estacionamento ainda não configurou o recebimento de pagamentos online. ' +
          'Por favor, escolha outro método de pagamento ou outro estacionamento.',
          400
        );
      }

      // Prepara os dados da reserva
      const reservaData = {
        estacionamento_id,
        usuario_id: userId,
        vaga_id: vaga_id || null,
        data_entrada_prevista: data_entrada,
        data_saida_prevista: data_saida,
        valor_total: valor,
        placa_veiculo: veiculo_placa,
        modelo_veiculo: veiculo_modelo,
        status: 'pendente',
        status_pagamento: 'pendente'
      };

      // Cria a reserva no banco
      const reserva = await reservaService.criarReserva(reservaData);

      logger.info('Reserva criada:', {
        reserva_id: reserva.id,
        valor
      });

      // Se for PIX, cria checkout Asaas (interface profissional)
      if (metodo_pagamento === 'pix') {
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        
        const checkoutResult = await asaasMarketplace.criarCheckout({
          valor,
          descricao: `Reserva #${reserva.id} - ${estacionamento.nome}`,
          email_pagador: userEmail,
          nome_pagador: req.user.nome || 'Cliente',
          cpf_pagador: req.user.cpf || null,
          telefone_pagador: req.user.telefone || null, // ✅ USANDO TELEFONE REAL DO USUÁRIO
          estacionamento_id,
          estacionamento_asaas_account_id: estacionamento.asaas_wallet_id,
          reserva_id: reserva.id,
          success_url: `${baseUrl}/user/home.html?reserva=${reserva.id}&status=sucesso`,
          cancel_url: `${baseUrl}/user/home.html?reserva=${reserva.id}&status=cancelado`
        });

        // Salva dados do pagamento no banco
        const pagamentoId = await pagamentoModel.criarPagamento({
          reserva_id: reserva.id,
          metodo: 'pix',
          valor,
          status: 'pendente',
          id_estacionamento: estacionamento_id,
          id_usuario: userId
        }, {
          payment_id: checkoutResult.checkout_id, // Salva o checkout_id
          comissao_plataforma: checkoutResult.comissao_plataforma,
          valor_estacionamento: checkoutResult.valor_estacionamento
        });

        logger.info('Checkout Asaas criado com split:', {
          pagamento_id: pagamentoId,
          checkout_id: checkoutResult.checkout_id,
          checkout_url: checkoutResult.checkout_url,
          comissao: checkoutResult.comissao_plataforma,
          valor_estacionamento: checkoutResult.valor_estacionamento
        });

        // Retorna URL do checkout para redirecionar
        return res.status(201).json({
          success: true,
          reserva: {
            id: reserva.id,
            estacionamento: {
              id: estacionamento.id,
              nome: estacionamento.nome,
              endereco: estacionamento.endereco
            },
            data_entrada: data_entrada,
            data_saida: data_saida,
            valor_total: valor,
            status: 'pendente',
            status_pagamento: 'pendente'
          },
          pagamento: {
            id: pagamentoId,
            checkout_id: checkoutResult.checkout_id,
            checkout_url: checkoutResult.checkout_url, // URL para redirecionar
            status: checkoutResult.status
          },
          // Dados do split
          split: {
            total: valor,
            comissao_plataforma: checkoutResult.comissao_plataforma,
            percentual_plataforma: `${checkoutResult.percentual_split}%`,
            valor_estacionamento: checkoutResult.valor_estacionamento,
            percentual_estacionamento: `${100 - checkoutResult.percentual_split}%`
          },
          message: 'Reserva criada! Redirecionando para pagamento...'
        });
      }

      // Para outros métodos de pagamento (futuro: cartão)
      res.status(201).json({
        success: true,
        data: {
          reserva,
          message: 'Reserva criada. Complete o pagamento para confirmar.'
        }
      });

    } catch (error) {
      logger.error('Erro ao criar reserva com pagamento:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Webhook para notificações de pagamento do Asaas
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async webhookPagamento(req, res, next) {
    try {
      const notification = req.body;

      logger.info('🔔 Webhook Asaas recebido:', {
        event: notification.event,
        payment_id: notification.payment?.id,
        body: JSON.stringify(notification, null, 2)
      });

      // Processar notificação do Asaas
      const result = await asaasMarketplace.processarNotificacao(notification);

      if (result.processed && result.payment) {
        const paymentData = result.payment;
        const paymentId = paymentData.id; // ID do Asaas
        const newStatus = paymentData.status; // PENDING, CONFIRMED, RECEIVED, etc

        logger.info('Processando atualização de pagamento:', {
          payment_id: paymentId,
          status: newStatus,
          external_reference: paymentData.externalReference
        });

        // Buscar pagamento no banco pelo payment_id do Asaas (salvo em dados_retorno)
        const sqlBuscaPagamento = `
          SELECT p.*
          FROM pagamentos p
          WHERE p.dados_retorno->>'payment_id' = $1
          LIMIT 1
        `;
        
        const { pool } = require('../config/database');
        const resultPagamento = await pool.query(sqlBuscaPagamento, [paymentId]);

        if (resultPagamento.rows.length > 0) {
          const pagamento = resultPagamento.rows[0];

          // Mapear status do Asaas para status interno
          let statusInterno = 'pendente';
          let statusReserva = null;

          switch(newStatus) {
            case 'PENDING':
              statusInterno = 'pendente';
              break;
            case 'CONFIRMED':
            case 'RECEIVED':
              statusInterno = 'aprovado';
              statusReserva = 'confirmada';
              break;
            case 'OVERDUE':
              statusInterno = 'expirado';
              statusReserva = 'cancelada';
              break;
            case 'REFUNDED':
            case 'RECEIVED_IN_CASH_UNDONE':
              statusInterno = 'estornado';
              statusReserva = 'cancelada';
              break;
            default:
              statusInterno = newStatus.toLowerCase();
          }

          // Atualizar status do pagamento
          await pool.query(
            'UPDATE pagamentos SET status = $1, updated_at = NOW() WHERE id = $2',
            [statusInterno, pagamento.id]
          );

          logger.info('✅ Status do pagamento atualizado:', {
            pagamento_id: pagamento.id,
            status_antigo: pagamento.status,
            status_novo: statusInterno
          });

          // Se aprovado, atualizar status da reserva e ocupar vaga
          if (statusReserva) {
            await reservaModel.atualizarStatusReserva(pagamento.reserva_id, statusReserva);
            await reservaModel.atualizarStatusPagamento(pagamento.reserva_id, 'pago');

            // Se confirmada, ocupar a vaga
            if (statusReserva === 'confirmada') {
              const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
              if (reserva && reserva.vaga_id) {
                await pool.query(
                  'UPDATE vagas SET status = $1, reserva_id_ativa = $2 WHERE id = $3',
                  ['ocupada', reserva.id, reserva.vaga_id]
                );
                
                logger.info('✅ Vaga ocupada após confirmação de pagamento:', {
                  vaga_id: reserva.vaga_id,
                  reserva_id: reserva.id
                });
              }
            }

            logger.info('✅ Reserva atualizada após pagamento:', {
              reserva_id: pagamento.reserva_id,
              status: statusReserva,
              pagamento_id: pagamento.id,
              payment_id: paymentId
            });
          }
        } else {
          logger.warn('⚠️ Pagamento não encontrado no banco:', {
            payment_id: paymentId
          });
        }
      }

      // Sempre retornar 200 para o Asaas não ficar retentando
      res.status(200).json({ success: true });

    } catch (error) {
      logger.error('❌ Erro ao processar webhook Asaas:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });
      // Mesmo com erro, retornar 200 para não ficar recebendo retry
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
      const { id } = req.params; // ID do pagamento
      const userId = req.user.id;

      // Busca o pagamento no banco de dados
      const pagamento = await pagamentoModel.buscarPagamentoPorId(id);

      if (!pagamento) {
        throw new AppError('Pagamento não encontrado', 404);
      }

      // Verifica se o pagamento pertence ao usuário
      if (pagamento.id_usuario !== userId) {
        throw new AppError('Não autorizado a consultar este pagamento', 403);
      }

      // Busca a reserva associada
      const reserva = await reservaModel.findReservaById(pagamento.reserva_id);

      res.status(200).json({
        success: true,
        data: {
          id: pagamento.id,
          status: pagamento.status,
          valor: pagamento.valor,
          metodo: pagamento.metodo,
          reserva_id: pagamento.reserva_id,
          reserva_status: reserva ? reserva.status : null,
          created_at: pagamento.created_at,
          updated_at: pagamento.updated_at,
          pix_qr_code: pagamento.pix_qr_code,
          pix_qr_code_text: pagamento.pix_qr_code_text,
          chave_pix: pagamento.chave_pix,
          expira_em: pagamento.expira_em
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
