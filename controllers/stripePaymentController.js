const { AppError, BadRequestError, NotFoundError, ForbiddenError } = require('../utils/AppError');
const logger = require('../utils/logger');
const reservaModel = require('../models/reservaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const pagamentoModel = require('../models/pagamentoModel');
const reservaService = require('../services/reservaService');
const stripeConnectService = require('../services/stripeConnectService');
const { PAYMENT_METHODS, PAYMENT_STATUS } = require('../config/constants');

class StripePaymentController {
    /**
     * Criar reserva com pagamento Stripe (PIX, Cartão, Boleto)
     * @route POST /api/stripe/reservas
     * @access Private
     */
    async criarReservaComStripe(req, res, next) {
        try {
            const { 
                estacionamento_id, 
                vaga_id, 
                data_entrada, 
                data_saida,
                metodo_pagamento, // 'pix', 'card', 'boleto'
                veiculo_placa,
                observacoes
            } = req.body;

            const userId = req.user.id;
            const userEmail = req.user.email;

            logger.info('Criando reserva com pagamento Stripe:', {
                userId,
                estacionamento_id,
                metodo_pagamento
            });

            // Validação básica
            if (!estacionamento_id || !data_entrada || !data_saida || !metodo_pagamento) {
                throw new BadRequestError('Dados obrigatórios não informados');
            }

            // 1. Buscar estacionamento e verificar se tem conta Stripe
            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            
            if (!estacionamento) {
                throw new NotFoundError('Estacionamento não encontrado');
            }

            if (!estacionamento.stripe_account_id) {
                throw new BadRequestError('Estacionamento não configurado para pagamentos online. Use outro método de pagamento.');
            }

            // Verificar se a conta Stripe está ativa
            if (!estacionamento.stripe_charges_enabled) {
                throw new BadRequestError('Estacionamento ainda não completou o processo de configuração de pagamentos. Use outro método de pagamento.');
            }

            // 2. Calcular valor da reserva
            const horaInicio = new Date(data_entrada);
            const horaFim = new Date(data_saida);
            const diferencaHoras = (horaFim - horaInicio) / (1000 * 60 * 60);
            const valor = diferencaHoras * estacionamento.preco_hora;

            if (valor <= 0) {
                throw new BadRequestError('Valor da reserva inválido');
            }

            logger.info('Valor calculado:', {
                horas: diferencaHoras,
                preco_hora: estacionamento.preco_hora,
                valor_total: valor
            });

            // 3. Criar reserva no banco
            const reserva = await reservaService.criarReserva({
                usuario_id: userId,
                estacionamento_id,
                vaga_id,
                data_entrada_prevista: horaInicio,
                data_saida_prevista: horaFim,
                valor_total: valor,
                placa_veiculo: veiculo_placa,
                observacoes,
                status: 'pendente',
                status_pagamento: 'pendente'
            });

            logger.info('Reserva criada:', {
                reserva_id: reserva.id,
                valor
            });

            // 4. Processar pagamento com split via Stripe
            let resultado;
            
            if (metodo_pagamento === 'pix') {
                resultado = await stripeConnectService.processarPixComSplit({
                    valor,
                    reserva_id: reserva.id,
                    estacionamento_stripe_account_id: estacionamento.stripe_account_id,
                    cliente_email: userEmail,
                    descricao: `Reserva #${reserva.id} - ${estacionamento.nome}`
                });
            } else {
                resultado = await stripeConnectService.processarPagamentoComSplit({
                    valor,
                    metodo: metodo_pagamento,
                    reserva_id: reserva.id,
                    estacionamento_stripe_account_id: estacionamento.stripe_account_id,
                    cliente_email: userEmail,
                    descricao: `Reserva #${reserva.id} - ${estacionamento.nome}`
                });
            }

            // 5. Registrar pagamento no banco
            const metodoPagamento = metodo_pagamento === 'pix' ? PAYMENT_METHODS.PIX : 
                                   metodo_pagamento === 'card' ? PAYMENT_METHODS.CARTAO_CREDITO :
                                   metodo_pagamento === 'boleto' ? PAYMENT_METHODS.BOLETO :
                                   PAYMENT_METHODS.DINHEIRO;

            const pagamentoId = await pagamentoModel.criarPagamento({
                reserva_id: reserva.id,
                metodo: metodoPagamento,
                valor,
                status: PAYMENT_STATUS.PENDENTE,
                id_estacionamento: estacionamento_id,
                id_usuario: userId
            }, {
                stripe_payment_intent_id: resultado.payment_intent_id,
                stripe_client_secret: resultado.client_secret,
                comissao_plataforma: resultado.comissao_plataforma,
                valor_estacionamento: resultado.valor_estacionamento,
                pix_qr_code: resultado.pix_qr_code,
                pix_code: resultado.pix_code,
                expires_at: resultado.expires_at
            });

            logger.info('Pagamento registrado:', {
                pagamento_id: pagamentoId,
                payment_intent_id: resultado.payment_intent_id
            });

            // 6. Preparar resposta
            const resposta = {
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
                    payment_intent_id: resultado.payment_intent_id,
                    client_secret: resultado.client_secret,
                    metodo: metodo_pagamento,
                    status: resultado.status
                }
            };

            // Adicionar dados do PIX se for pagamento PIX
            if (metodo_pagamento === 'pix' && resultado.pix_qr_code) {
                resposta.pix = {
                    qr_code: resultado.pix_qr_code,
                    qr_code_png: resultado.pix_qr_code_png,
                    pix_code: resultado.pix_code,
                    expires_at: resultado.expires_at
                };
            }

            res.status(201).json({
                success: true,
                data: resposta,
                message: metodo_pagamento === 'pix' 
                    ? 'Reserva criada! Escaneie o QR Code ou use o código PIX para pagar.'
                    : 'Reserva criada! Complete o pagamento para confirmar.'
            });

        } catch (error) {
            logger.error('Erro ao criar reserva com Stripe:', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            next(error);
        }
    }

    /**
     * Conectar estacionamento ao Stripe
     * @route POST /api/stripe/estacionamentos/:estacionamento_id/conectar
     * @access Private (Admin do estacionamento)
     */
    async conectarEstacionamento(req, res, next) {
        try {
            const { estacionamento_id } = req.params;
            const userId = req.user.id;

            logger.info('Conectando estacionamento ao Stripe:', {
                estacionamento_id,
                userId
            });

            // Verificar permissão
            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            
            if (!estacionamento) {
                throw new NotFoundError('Estacionamento não encontrado');
            }

            if (estacionamento.usuario_id !== userId) {
                throw new ForbiddenError('Você não tem permissão para conectar este estacionamento');
            }

            // Verificar se já está conectado
            if (estacionamento.stripe_account_id) {
                // Verificar status da conta
                const accountStatus = await stripeConnectService.verificarStatusConta(
                    estacionamento.stripe_account_id
                );

                return res.json({
                    success: true,
                    data: {
                        account_id: estacionamento.stripe_account_id,
                        status: accountStatus,
                        message: 'Estacionamento já conectado ao Stripe'
                    }
                });
            }

            // Criar conta conectada
            const account = await stripeConnectService.criarContaConectada({
                id: estacionamento_id,
                nome: estacionamento.nome,
                email: req.user.email,
                website: estacionamento.website
            });

            // Atualizar estacionamento com account_id
            await estacionamentoModel.update(estacionamento_id, {
                stripe_account_id: account.id,
                stripe_account_status: 'created'
            });

            // Gerar link de onboarding
            const onboardingUrl = await stripeConnectService.gerarLinkOnboarding(account.id);

            res.json({
                success: true,
                data: {
                    account_id: account.id,
                    onboarding_url: onboardingUrl
                },
                message: 'Conta Stripe criada! Complete o processo de configuração no link fornecido.'
            });

        } catch (error) {
            logger.error('Erro ao conectar estacionamento:', {
                error: error.message,
                stack: error.stack,
                estacionamento_id: req.params.estacionamento_id
            });
            next(error);
        }
    }

    /**
     * Verificar status da conexão Stripe
     * @route GET /api/stripe/estacionamentos/:estacionamento_id/status
     * @access Private
     */
    async verificarStatusConexao(req, res, next) {
        try {
            const { estacionamento_id } = req.params;
            const userId = req.user.id;

            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            
            if (!estacionamento) {
                throw new NotFoundError('Estacionamento não encontrado');
            }

            if (estacionamento.usuario_id !== userId) {
                throw new ForbiddenError('Sem permissão');
            }

            if (!estacionamento.stripe_account_id) {
                return res.json({
                    success: true,
                    data: {
                        connected: false,
                        message: 'Estacionamento não conectado ao Stripe'
                    }
                });
            }

            const accountStatus = await stripeConnectService.verificarStatusConta(
                estacionamento.stripe_account_id
            );

            // Atualizar status no banco
            await estacionamentoModel.update(estacionamento_id, {
                stripe_charges_enabled: accountStatus.charges_enabled,
                stripe_payouts_enabled: accountStatus.payouts_enabled,
                stripe_account_status: accountStatus.details_submitted ? 'active' : 'pending'
            });

            res.json({
                success: true,
                data: {
                    connected: true,
                    account_id: estacionamento.stripe_account_id,
                    status: accountStatus
                }
            });

        } catch (error) {
            logger.error('Erro ao verificar status:', error);
            next(error);
        }
    }

    /**
     * Webhook Stripe
     * @route POST /api/stripe/webhook
     * @access Public (validado por assinatura)
     */
    async webhook(req, res, next) {
        try {
            logger.info('Webhook Stripe recebido');

            const resultado = await stripeConnectService.processarWebhook(req);
            
            res.json({ received: true, type: resultado.type });
        } catch (error) {
            logger.error('Erro no webhook Stripe:', {
                error: error.message,
                stack: error.stack
            });
            
            // Retornar 200 mesmo com erro para evitar reenvios
            res.status(200).json({ 
                received: false, 
                error: error.message 
            });
        }
    }

    /**
     * Cancelar pagamento
     * @route POST /api/stripe/pagamentos/:pagamento_id/cancelar
     * @access Private
     */
    async cancelarPagamento(req, res, next) {
        try {
            const { pagamento_id } = req.params;
            const userId = req.user.id;

            const pagamento = await pagamentoModel.buscarPagamentoPorId(pagamento_id);
            
            if (!pagamento) {
                throw new NotFoundError('Pagamento não encontrado');
            }

            // Verificar permissão
            const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
            
            if (!reserva) {
                throw new NotFoundError('Reserva não encontrada');
            }
            
            if (reserva.usuario_id !== userId) {
                throw new ForbiddenError('Sem permissão');
            }

            // Cancelar no Stripe
            const paymentIntentId = pagamento.dados_retorno?.stripe_payment_intent_id;
            if (!paymentIntentId) {
                throw new BadRequestError('Payment Intent não encontrado');
            }

            await stripeConnectService.cancelarPagamento(paymentIntentId);

            // Atualizar no banco
            await pagamentoModel.atualizarStatusPagamento(
                pagamento_id,
                PAYMENT_STATUS.CANCELADO
            );

            res.json({
                success: true,
                message: 'Pagamento cancelado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao cancelar pagamento:', error);
            next(error);
        }
    }

    /**
     * Reembolsar pagamento
     * @route POST /api/stripe/pagamentos/:pagamento_id/reembolsar
     * @access Private (Admin do estacionamento)
     */
    async reembolsarPagamento(req, res, next) {
        try {
            const { pagamento_id } = req.params;
            const { amount } = req.body; // Opcional, se não informado reembolsa tudo
            const userId = req.user.id;

            const pagamento = await pagamentoModel.buscarPagamentoPorId(pagamento_id);
            
            if (!pagamento) {
                throw new NotFoundError('Pagamento não encontrado');
            }

            // Verificar permissão (deve ser admin do estacionamento)
            const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
            
            if (!reserva) {
                throw new NotFoundError('Reserva não encontrada');
            }
            
            const estacionamento = await estacionamentoModel.findById(reserva.estacionamento_id);
            
            if (!estacionamento) {
                throw new NotFoundError('Estacionamento não encontrado');
            }
            
            if (estacionamento.usuario_id !== userId) {
                throw new ForbiddenError('Sem permissão para reembolsar este pagamento');
            }

            // Buscar charge_id
            const chargeId = pagamento.dados_retorno?.stripe_charge_id;
            if (!chargeId) {
                throw new BadRequestError('Charge não encontrado para reembolso');
            }

            // Processar reembolso no Stripe
            const amountCents = amount ? Math.round(amount * 100) : null;
            const refund = await stripeConnectService.processarReembolso(chargeId, amountCents);

            // Atualizar status
            await pagamentoModel.atualizarStatusPagamento(
                pagamento_id,
                PAYMENT_STATUS.REEMBOLSADO,
                {
                    stripe_refund_id: refund.id,
                    refund_amount: refund.amount / 100,
                    refund_status: refund.status
                }
            );

            res.json({
                success: true,
                data: {
                    refund_id: refund.id,
                    amount: refund.amount / 100,
                    status: refund.status
                },
                message: 'Reembolso processado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao reembolsar pagamento:', error);
            next(error);
        }
    }
}

module.exports = new StripePaymentController();
