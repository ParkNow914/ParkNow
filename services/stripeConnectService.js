const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');
const estacionamentoModel = require('../models/estacionamentoModel');
const pagamentoModel = require('../models/pagamentoModel');
const reservaModel = require('../models/reservaModel');
const notificationService = require('./notificationService');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../config/constants');

class StripeConnectService {
    /**
     * Cria uma conta conectada para um estacionamento
     * @param {Object} estacionamentoData - Dados do estacionamento
     * @returns {Promise<Object>} Conta Stripe criada
     */
    async criarContaConectada(estacionamentoData) {
        try {
            logger.info('Criando conta conectada Stripe para estacionamento:', {
                estacionamento_id: estacionamentoData.id,
                email: estacionamentoData.email
            });

            const account = await stripe.accounts.create({
                type: 'standard', // Permite que o estacionamento gerencie sua própria conta
                country: 'BR',
                email: estacionamentoData.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                    pix_payments: { requested: true }, // PIX
                    boleto_payments: { requested: true }
                },
                business_profile: {
                    name: estacionamentoData.nome,
                    mcc: '7523', // Código MCC para estacionamentos
                    url: estacionamentoData.website || `https://parknow.com.br/estacionamentos/${estacionamentoData.id}`
                }
            });

            logger.info('Conta conectada Stripe criada:', {
                estacionamento_id: estacionamentoData.id,
                stripe_account_id: account.id
            });

            return account;
        } catch (error) {
            logger.error('Erro ao criar conta conectada Stripe:', error);
            throw error;
        }
    }

    /**
     * Gera link para onboarding do estacionamento
     * @param {string} stripeAccountId - ID da conta Stripe
     * @returns {Promise<string>} URL de onboarding
     */
    async gerarLinkOnboarding(stripeAccountId) {
        try {
            const accountLink = await stripe.accountLinks.create({
                account: stripeAccountId,
                refresh_url: `${process.env.FRONTEND_URL}/estacionamentos/conectar/refresh`,
                return_url: `${process.env.FRONTEND_URL}/estacionamentos/conectar/sucesso`,
                type: 'account_onboarding'
            });

            logger.info('Link de onboarding gerado:', {
                stripe_account_id: stripeAccountId,
                url: accountLink.url
            });

            return accountLink.url;
        } catch (error) {
            logger.error('Erro ao gerar link de onboarding:', error);
            throw error;
        }
    }

    /**
     * Verifica status da conta conectada
     * @param {string} stripeAccountId - ID da conta Stripe
     * @returns {Promise<Object>} Status da conta
     */
    async verificarStatusConta(stripeAccountId) {
        try {
            const account = await stripe.accounts.retrieve(stripeAccountId);

            return {
                id: account.id,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled,
                details_submitted: account.details_submitted,
                requirements: account.requirements
            };
        } catch (error) {
            logger.error('Erro ao verificar status da conta:', error);
            throw error;
        }
    }

    /**
     * Processa pagamento com split automático
     * @param {Object} pagamentoData - Dados do pagamento
     * @returns {Promise<Object>} Resultado do pagamento
     */
    async processarPagamentoComSplit(pagamentoData) {
        const {
            valor,
            metodo,
            reserva_id,
            estacionamento_stripe_account_id,
            cliente_email,
            descricao
        } = pagamentoData;

        try {
            logger.info('Processando pagamento com split:', {
                reserva_id,
                valor,
                metodo,
                estacionamento_stripe_account_id
            });

            // Calcula comissão da plataforma (15% padrão, configurável)
            const percentualComissao = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT || 15);
            const comissaoPlatforma = Math.round(valor * (percentualComissao / 100));
            const valorEstacionamento = valor - comissaoPlatforma;

            logger.info('Split calculado:', {
                valor_total: valor,
                comissao_plataforma: comissaoPlatforma,
                valor_estacionamento: valorEstacionamento,
                percentual: percentualComissao
            });

            // Define métodos de pagamento baseado no tipo
            let paymentMethodTypes = ['card'];
            if (metodo === 'pix') {
                paymentMethodTypes = ['pix'];
            } else if (metodo === 'boleto') {
                paymentMethodTypes = ['boleto'];
            }

            // Cria Payment Intent com split
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(valor * 100), // Converte para centavos
                currency: 'brl',
                payment_method_types: paymentMethodTypes,
                
                // SPLIT: Define onde o dinheiro vai
                application_fee_amount: Math.round(comissaoPlatforma * 100),
                transfer_data: {
                    destination: estacionamento_stripe_account_id
                },

                metadata: {
                    reserva_id: reserva_id.toString(),
                    tipo: 'reserva_estacionamento',
                    comissao_plataforma: comissaoPlatforma.toString(),
                    valor_estacionamento: valorEstacionamento.toString()
                },

                receipt_email: cliente_email,
                description: descricao || `Reserva #${reserva_id} - Estacionamento ParkNow`
            });

            logger.info('Payment Intent criado:', {
                payment_intent_id: paymentIntent.id,
                status: paymentIntent.status,
                reserva_id
            });

            return {
                payment_intent_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                status: paymentIntent.status,
                comissao_plataforma: comissaoPlatforma,
                valor_estacionamento: valorEstacionamento,
                next_action: paymentIntent.next_action
            };

        } catch (error) {
            logger.error('Erro ao processar pagamento com split:', error);
            throw error;
        }
    }

    /**
     * Processa pagamento PIX com split
     * @param {Object} pagamentoData - Dados do pagamento
     * @returns {Promise<Object>} Resultado com QR Code PIX
     */
    async processarPixComSplit(pagamentoData) {
        try {
            const resultado = await this.processarPagamentoComSplit({
                ...pagamentoData,
                metodo: 'pix'
            });

            // Se houver next_action com PIX, extrai os dados do QR Code
            let pixData = {};
            if (resultado.next_action?.pix_display_qr_code) {
                pixData = {
                    pix_qr_code: resultado.next_action.pix_display_qr_code.image_url_svg,
                    pix_qr_code_png: resultado.next_action.pix_display_qr_code.image_url_png,
                    pix_code: resultado.next_action.pix_display_qr_code.data,
                    expires_at: resultado.next_action.pix_display_qr_code.expires_at
                };

                logger.info('QR Code PIX gerado via Stripe:', {
                    payment_intent_id: resultado.payment_intent_id,
                    expires_at: pixData.expires_at
                });
            }

            return {
                ...resultado,
                ...pixData
            };
        } catch (error) {
            logger.error('Erro ao processar PIX com split:', error);
            throw error;
        }
    }

    /**
     * Processa webhook do Stripe
     * @param {Object} req - Request object com body e headers
     * @returns {Promise<Object>} Resultado do processamento
     */
    async processarWebhook(req) {
        const sig = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        if (!webhookSecret) {
            logger.error('STRIPE_WEBHOOK_SECRET não configurado');
            throw new Error('Webhook secret não configurado');
        }

        try {
            // Valida e constrói o evento do webhook
            const event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                webhookSecret
            );

            logger.info('Webhook Stripe recebido:', {
                type: event.type,
                id: event.id
            });

            // Processa baseado no tipo de evento
            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePagamentoSucesso(event.data.object);
                    break;

                case 'payment_intent.payment_failed':
                    await this.handlePagamentoFalha(event.data.object);
                    break;

                case 'payment_intent.canceled':
                    await this.handlePagamentoCancelado(event.data.object);
                    break;

                case 'transfer.created':
                    await this.handleTransferenciaCriada(event.data.object);
                    break;

                case 'account.updated':
                    await this.handleContaAtualizada(event.data.object);
                    break;

                case 'charge.refunded':
                    await this.handleReembolso(event.data.object);
                    break;

                default:
                    logger.info('Evento webhook não processado:', event.type);
            }

            return { received: true, type: event.type };
        } catch (err) {
            logger.error('Erro ao processar webhook Stripe:', err);
            throw err;
        }
    }

    /**
     * Handler para pagamento bem-sucedido
     * @private
     */
    async handlePagamentoSucesso(paymentIntent) {
        try {
            const reservaId = parseInt(paymentIntent.metadata.reserva_id);

            logger.info('Processando pagamento bem-sucedido:', {
                payment_intent_id: paymentIntent.id,
                reserva_id: reservaId,
                amount: paymentIntent.amount / 100
            });

            // Buscar pagamento existente pelo payment_intent_id
            const pagamentos = await pagamentoModel.buscarPagamentosPorReserva(reservaId);
            const pagamento = pagamentos.find(p => 
                p.dados_retorno?.stripe_payment_intent_id === paymentIntent.id
            );

            if (pagamento) {
                // Atualizar pagamento existente
                await pagamentoModel.atualizarStatusPagamento(
                    pagamento.id,
                    PAYMENT_STATUS.APROVADO,
                    {
                        stripe_payment_succeeded_at: new Date(),
                        stripe_charge_id: paymentIntent.charges?.data[0]?.id
                    }
                );

                logger.info('Status do pagamento atualizado para aprovado:', {
                    pagamento_id: pagamento.id,
                    reserva_id: reservaId
                });
            }

            // Confirmar reserva
            await reservaModel.atualizarStatus(reservaId, 'confirmada');

            // Notificar cliente
            const reserva = await reservaModel.findReservaById(reservaId);
            if (reserva && reserva.usuario_id) {
                await notificationService.enviarNotificacao(
                    reserva.usuario_id,
                    {
                        tipo: 'pagamento_confirmado',
                        titulo: 'Pagamento Confirmado',
                        mensagem: `Seu pagamento de R$ ${(paymentIntent.amount / 100).toFixed(2)} foi confirmado com sucesso!`,
                        dados: {
                            reserva_id: reservaId,
                            payment_intent_id: paymentIntent.id,
                            valor: paymentIntent.amount / 100
                        }
                    }
                );
            }

            logger.info('Pagamento processado com sucesso:', {
                reserva_id: reservaId,
                payment_intent_id: paymentIntent.id
            });
        } catch (error) {
            logger.error('Erro ao processar pagamento bem-sucedido:', error);
            throw error;
        }
    }

    /**
     * Handler para pagamento falhado
     * @private
     */
    async handlePagamentoFalha(paymentIntent) {
        try {
            const reservaId = parseInt(paymentIntent.metadata.reserva_id);

            logger.warn('Processando falha de pagamento:', {
                payment_intent_id: paymentIntent.id,
                reserva_id: reservaId,
                error: paymentIntent.last_payment_error?.message
            });

            // Buscar e atualizar pagamento
            const pagamentos = await pagamentoModel.buscarPagamentosPorReserva(reservaId);
            const pagamento = pagamentos.find(p => 
                p.dados_retorno?.stripe_payment_intent_id === paymentIntent.id
            );

            if (pagamento) {
                await pagamentoModel.atualizarStatusPagamento(
                    pagamento.id,
                    PAYMENT_STATUS.RECUSADO,
                    {
                        stripe_error: paymentIntent.last_payment_error,
                        stripe_failed_at: new Date()
                    }
                );
            }

            // Notificar cliente sobre a falha
            const reserva = await reservaModel.findReservaById(reservaId);
            if (reserva && reserva.usuario_id) {
                await notificationService.enviarNotificacao(
                    reserva.usuario_id,
                    {
                        tipo: 'pagamento_falhou',
                        titulo: 'Falha no Pagamento',
                        mensagem: 'Não foi possível processar seu pagamento. Por favor, tente novamente.',
                        dados: {
                            reserva_id: reservaId,
                            erro: paymentIntent.last_payment_error?.message
                        }
                    }
                );
            }
        } catch (error) {
            logger.error('Erro ao processar falha de pagamento:', error);
            throw error;
        }
    }

    /**
     * Handler para pagamento cancelado
     * @private
     */
    async handlePagamentoCancelado(paymentIntent) {
        try {
            const reservaId = parseInt(paymentIntent.metadata.reserva_id);

            logger.info('Processando cancelamento de pagamento:', {
                payment_intent_id: paymentIntent.id,
                reserva_id: reservaId
            });

            const pagamentos = await pagamentoModel.buscarPagamentosPorReserva(reservaId);
            const pagamento = pagamentos.find(p => 
                p.dados_retorno?.stripe_payment_intent_id === paymentIntent.id
            );

            if (pagamento) {
                await pagamentoModel.atualizarStatusPagamento(
                    pagamento.id,
                    PAYMENT_STATUS.CANCELADO,
                    {
                        stripe_canceled_at: new Date()
                    }
                );
            }
        } catch (error) {
            logger.error('Erro ao processar cancelamento de pagamento:', error);
            throw error;
        }
    }

    /**
     * Handler para transferência criada
     * @private
     */
    async handleTransferenciaCriada(transfer) {
        try {
            logger.info('Transferência criada para estacionamento:', {
                transfer_id: transfer.id,
                amount: transfer.amount / 100,
                destination: transfer.destination
            });

            // Aqui você pode registrar a transferência no banco se necessário
            // Por exemplo, atualizar o registro do pagamento com o transfer_id
        } catch (error) {
            logger.error('Erro ao processar criação de transferência:', error);
            throw error;
        }
    }

    /**
     * Handler para conta atualizada
     * @private
     */
    async handleContaAtualizada(account) {
        try {
            logger.info('Conta Stripe atualizada:', {
                account_id: account.id,
                charges_enabled: account.charges_enabled,
                payouts_enabled: account.payouts_enabled
            });

            // Atualizar status no banco de dados se necessário
            // Por exemplo, habilitar/desabilitar recebimentos do estacionamento
        } catch (error) {
            logger.error('Erro ao processar atualização de conta:', error);
            throw error;
        }
    }

    /**
     * Handler para reembolso
     * @private
     */
    async handleReembolso(charge) {
        try {
            logger.info('Reembolso processado:', {
                charge_id: charge.id,
                amount_refunded: charge.amount_refunded / 100
            });

            // Atualizar status do pagamento para reembolsado se necessário
        } catch (error) {
            logger.error('Erro ao processar reembolso:', error);
            throw error;
        }
    }

    /**
     * Cancela um Payment Intent
     * @param {string} paymentIntentId - ID do Payment Intent
     * @returns {Promise<Object>} Payment Intent cancelado
     */
    async cancelarPagamento(paymentIntentId) {
        try {
            const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
            
            logger.info('Payment Intent cancelado:', {
                payment_intent_id: paymentIntentId,
                status: paymentIntent.status
            });

            return paymentIntent;
        } catch (error) {
            logger.error('Erro ao cancelar Payment Intent:', error);
            throw error;
        }
    }

    /**
     * Processa um reembolso
     * @param {string} chargeId - ID do charge a ser reembolsado
     * @param {number} [amount] - Valor a reembolsar em centavos (opcional, padrão é total)
     * @returns {Promise<Object>} Refund object
     */
    async processarReembolso(chargeId, amount = null) {
        try {
            const refundData = { charge: chargeId };
            if (amount) {
                refundData.amount = amount;
            }

            const refund = await stripe.refunds.create(refundData);
            
            logger.info('Reembolso criado:', {
                refund_id: refund.id,
                charge_id: chargeId,
                amount: refund.amount / 100,
                status: refund.status
            });

            return refund;
        } catch (error) {
            logger.error('Erro ao processar reembolso:', error);
            throw error;
        }
    }
}

module.exports = new StripeConnectService();
