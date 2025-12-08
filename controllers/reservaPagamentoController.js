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
      // TEMPORÁRIO: Permitir pagamentos mesmo sem asaas_wallet_id (split será feito manualmente)
      if (!estacionamento.asaas_wallet_id) {
        logger.warn('Estacionamento sem conta ASAAS vinculada - usando conta principal:', {
          estacionamento_id,
          nome: estacionamento.nome
        });
        
        // Por enquanto, permitir o pagamento mas logar o aviso
        // TODO: Implementar split manual ou configurar marketplace
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

      // Se for PIX, usa o Checkout oficial do Asaas (interface pronta e segura)
      if (metodo_pagamento === 'pix') {
        // Construir URLs de callback
        const baseUrl = process.env.BASE_URL || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const successUrl = `${baseUrl}/user/home.html?pagamento=sucesso&reserva_id=${reserva.id}`;
        const cancelUrl = `${baseUrl}/user/home.html?pagamento=cancelado&reserva_id=${reserva.id}`;

        logger.info('Criando Checkout Asaas para reserva:', {
          reserva_id: reserva.id,
          baseUrl,
          successUrl,
          cancelUrl
        });

        // Criar checkout no Asaas (redireciona para página oficial de pagamento)
        const checkoutResult = await asaasMarketplace.criarCheckout({
          valor,
          descricao: `Reserva #${reserva.id} - ${estacionamento.nome}`,
          email_pagador: userEmail,
          nome_pagador: req.user.nome || 'Cliente',
          cpf_pagador: req.user.cpf || null,
          telefone_pagador: req.user.telefone || null,
          estacionamento_id,
          estacionamento_asaas_account_id: estacionamento.asaas_wallet_id,
          reserva_id: reserva.id,
          success_url: successUrl,
          cancel_url: cancelUrl
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
          checkout_id: checkoutResult.checkout_id,
          checkout_url: checkoutResult.checkout_url,
          payment_id: checkoutResult.payment_id
        });

        logger.info('Checkout Asaas criado:', {
          pagamento_id: pagamentoId,
          checkout_id: checkoutResult.checkout_id,
          checkout_url: checkoutResult.checkout_url,
          valor: valor
        });

        // Retorna URL do checkout para redirecionamento
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
            checkout_url: checkoutResult.checkout_url,
            status: 'pendente'
          },
          // URL do checkout para redirecionamento direto
          checkout_url: checkoutResult.checkout_url,
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
        // Também procurar pelo checkout_id caso o pagamento tenha sido feito via checkout
        const sqlBuscaPagamento = `
          SELECT p.*
          FROM pagamentos p
          WHERE p.dados_retorno->>'payment_id' = $1
             OR p.dados_retorno->>'checkout_id' = $2
          LIMIT 1
        `;
        
        const { pool } = require('../config/database');
        
        // Buscar pelo payment_id ou external_reference
        let resultPagamento = await pool.query(sqlBuscaPagamento, [paymentId, paymentId]);
        
        // Se não encontrou, tentar buscar pelo external_reference (reserva_id)
        if (resultPagamento.rows.length === 0 && paymentData.externalReference) {
          const reservaIdMatch = paymentData.externalReference.match(/reserva_(\d+)/);
          if (reservaIdMatch) {
            const reservaId = reservaIdMatch[1];
            logger.info('Buscando pagamento pela reserva_id:', reservaId);
            
            const sqlBuscaPorReserva = `
              SELECT p.*
              FROM pagamentos p
              WHERE p.reserva_id = $1
              ORDER BY p.created_at DESC
              LIMIT 1
            `;
            resultPagamento = await pool.query(sqlBuscaPorReserva, [reservaId]);
            
            // Se encontrou, atualizar o payment_id no dados_retorno
            if (resultPagamento.rows.length > 0) {
              const pagamentoEncontrado = resultPagamento.rows[0];
              const dadosAtuais = pagamentoEncontrado.dados_retorno || {};
              dadosAtuais.payment_id = paymentId;
              
              await pool.query(
                'UPDATE pagamentos SET dados_retorno = $1, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(dadosAtuais), pagamentoEncontrado.id]
              );
              
              logger.info('✅ payment_id atualizado no pagamento:', {
                pagamento_id: pagamentoEncontrado.id,
                payment_id: paymentId
              });
            }
          }
        }

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
   * Retorna os dados PIX associados a uma reserva
   */
  async obterPixPorReserva(req, res, next) {
    try {
      const reservaId = parseInt(req.params.id, 10);
      const userId = req.user.id;

      if (Number.isNaN(reservaId)) {
        throw new AppError('ID da reserva inválido', 400);
      }

      const reserva = await reservaModel.findReservaById(reservaId);

      if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
      }

      if (reserva.usuario_id !== userId) {
        throw new AppError('Você não tem permissão para acessar esta reserva', 403);
      }

      const pagamento = await pagamentoModel.buscarUltimoPagamentoPorReserva(reservaId);

      if (!pagamento) {
        throw new AppError('Nenhum pagamento associado a esta reserva', 404);
      }

      const metodoPagamento = pagamento.metodo_pagamento || pagamento.metodo;
      if (metodoPagamento !== 'pix') {
        throw new AppError('Esta reserva não possui pagamento PIX válido', 400);
      }

      const rawData = pagamento.dados_retorno || {};
      let dadosPix = rawData;
      if (typeof rawData === 'string') {
        try {
          dadosPix = JSON.parse(rawData);
        } catch (parseError) {
          logger.warn('Falha ao parsear dados_retorno do pagamento PIX:', {
            pagamento_id: pagamento.id,
            error: parseError.message
          });
          dadosPix = {};
        }
      }

      const qrCodeBase64 = dadosPix.qr_code_base64 || dadosPix.pix_qr_code_base64 || pagamento.pix_qr_code;
      const qrCodeText = dadosPix.qr_code_text || dadosPix.qr_code || dadosPix.pix_qr_code;

      if (!qrCodeBase64 && !qrCodeText) {
        throw new AppError('Dados do QR Code PIX indisponíveis. Gere um novo pagamento.', 409);
      }

      const splitInfo = dadosPix.split || {
        total: pagamento.valor,
        comissao_plataforma: dadosPix.comissao_plataforma,
        valor_estacionamento: dadosPix.valor_estacionamento,
        percentual_plataforma: dadosPix.percentual_split,
        percentual_estacionamento: dadosPix.percentual_estacionamento ||
          (typeof dadosPix.percentual_split === 'number'
            ? parseFloat((100 - dadosPix.percentual_split).toFixed(2))
            : undefined)
      };

      return res.status(200).json({
        success: true,
        data: {
          reserva_id: reservaId,
          pagamento_id: pagamento.id,
          payment_id: dadosPix.payment_id || pagamento.id,
          gateway_payment_id: dadosPix.payment_id || pagamento.id,
          status: pagamento.status,
          valor: pagamento.valor,
          qr_code: qrCodeText,
          qr_code_text: qrCodeText,
          qr_code_base64: qrCodeBase64,
          split: splitInfo,
          expira_em: dadosPix.expira_em || dadosPix.date_of_expiration || pagamento.expira_em,
          chave_pix: dadosPix.chave_pix || null,
          nome_titular: dadosPix.nome_titular || req.user.nome || null
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
