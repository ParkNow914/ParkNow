const { AppError: _AppError, BadRequestError, NotFoundError, ForbiddenError } = require('../utils/AppError');
const logger = require('../utils/logger');
const reservaModel = require('../models/reservaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const pagamentoModel = require('../models/pagamentoModel');
const paymentProcessingService = require('../services/estacionamentoPaymentProcessingService');
const asaasMarketplaceService = require('../services/asaasMarketplaceService');
const { PAYMENT_METHODS, PAYMENT_STATUS } = require('../config/constants');

class PaymentController {
    /**
     * Processa um pagamento para uma reserva
     * @route POST /api/payments/processar-pagamento/:reservaId
     * @access Private
     */
    async processarPagamento(req, res, next) {
        const { reservaId } = req.params;
        const { metodo_pagamento, dados_pagamento } = req.body;
        const userId = req.user.id;
        
        try {
            // Validação básica
            if (!metodo_pagamento || !dados_pagamento) {
                throw new BadRequestError('Método de pagamento e dados são obrigatórios');
            }
            
            // Busca a reserva
            const reserva = await reservaModel.findReservaById(reservaId);
            if (!reserva) {
                throw new NotFoundError('Reserva não encontrada');
            }
            
            // Verifica se o usuário tem permissão
            if (reserva.usuario_id !== userId) {
                throw new ForbiddenError('Você não tem permissão para acessar esta reserva');
            }
            
            // Verifica se a reserva já foi paga
            if (reserva.status_pagamento === PAYMENT_STATUS.APROVADO) {
                return res.json({
                    success: true,
                    message: 'Esta reserva já foi paga',
                    data: {
                        reserva_id: reserva.id,
                        status: PAYMENT_STATUS.APROVADO,
                        valor: reserva.valor_total
                    }
                });
            }
            
            const estacionamento = await estacionamentoModel.findById(reserva.estacionamento_id);
            if (!estacionamento) {
                throw new NotFoundError('Estacionamento associado à reserva não foi encontrado');
            }

            // Processa o pagamento com base no método
            if (metodo_pagamento === PAYMENT_METHODS.PIX || metodo_pagamento === 'pix') {
                const resultadoPix = await this.processarPagamentoPixAsaas({
                    reserva,
                    estacionamento,
                    usuario: req.user,
                    req
                });

                return res.status(201).json({
                    success: true,
                    message: 'Checkout de pagamento PIX gerado com sucesso',
                    data: resultadoPix
                });
            }

            const resultado = await paymentProcessingService.processarPagamento(
                reservaId,
                metodo_pagamento,
                dados_pagamento
            );
            
            // Resposta de sucesso
            return res.status(200).json({
                success: true,
                message: 'Pagamento processado com sucesso',
                data: resultado
            });
            
        } catch (error) {
            logger.error('Erro ao processar pagamento:', {
                error: error.message,
                stack: error.stack,
                reservaId,
                userId,
                metodo_pagamento,
                dados_pagamento: dados_pagamento ? '*** DADOS OCULTOS ***' : undefined
            });
            next(error);
        }
    }

    async processarPagamentoPixAsaas({ reserva, estacionamento, usuario, req }) {
        if (!usuario?.email) {
            throw new BadRequestError('Usuário sem email válido para gerar pagamento PIX');
        }

        // Construir URLs de callback
        const baseUrl = process.env.BASE_URL || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const successUrl = `${baseUrl}/user/home.html?pagamento=sucesso&reserva_id=${reserva.id}`;
        const cancelUrl = `${baseUrl}/user/home.html?pagamento=cancelado&reserva_id=${reserva.id}`;

        // Usar Checkout oficial do Asaas
        const checkoutResult = await asaasMarketplaceService.criarCheckout({
            valor: reserva.valor_total,
            descricao: `Reserva #${reserva.id} - ${estacionamento.nome}`,
            email_pagador: usuario.email,
            nome_pagador: usuario.nome || 'Cliente',
            cpf_pagador: usuario.cpf || null,
            telefone_pagador: usuario.telefone || null,
            estacionamento_id: estacionamento.id,
            estacionamento_asaas_account_id: estacionamento.asaas_wallet_id,
            reserva_id: reserva.id,
            success_url: successUrl,
            cancel_url: cancelUrl
        });

        const pagamentoId = await pagamentoModel.criarPagamento({
            reserva_id: reserva.id,
            metodo: PAYMENT_METHODS.PIX,
            valor: reserva.valor_total,
            status: PAYMENT_STATUS.PENDENTE,
            id_estacionamento: estacionamento.id,
            id_usuario: reserva.usuario_id
        }, {
            checkout_id: checkoutResult.checkout_id,
            checkout_url: checkoutResult.checkout_url,
            payment_id: checkoutResult.payment_id
        });

        logger.info('Checkout Asaas gerado para reserva existente:', {
            reserva_id: reserva.id,
            pagamento_id: pagamentoId,
            checkout_id: checkoutResult.checkout_id,
            checkout_url: checkoutResult.checkout_url
        });

        return {
            reserva_id: reserva.id,
            pagamento_id: pagamentoId,
            checkout_id: checkoutResult.checkout_id,
            checkout_url: checkoutResult.checkout_url,
            status: PAYMENT_STATUS.PENDENTE,
            valor: reserva.valor_total
        };
    }
    
    /**
     * Verifica o status de um pagamento
     * @route GET /api/payments/status/:pagamentoId
     * @access Private
     */
    async verificarStatusPagamento(req, res, next) {
        const { pagamentoId } = req.params;
        const userId = req.user.id;
        
        try {
            // Busca os dados do pagamento
            const pagamento = await pagamentoModel.buscarPorId(pagamentoId);
            if (!pagamento) {
                throw new NotFoundError('Pagamento não encontrado');
            }
            
            // Busca a reserva associada
            const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
            if (!reserva) {
                throw new NotFoundError('Reserva não encontrada');
            }
            
            // Verifica permissão
            if (reserva.usuario_id !== userId) {
                throw new ForbiddenError('Você não tem permissão para acessar este pagamento');
            }
            
            // Se o pagamento já foi processado, retorna os dados atuais
            if (pagamento.status !== PAYMENT_STATUS.PENDENTE) {
                return res.json({
                    success: true,
                    data: {
                        status: pagamento.status,
                        data_atualizacao: pagamento.data_atualizacao,
                        metodo_pagamento: pagamento.metodo,
                        valor: pagamento.valor,
                        reserva_id: reserva.id
                    }
                });
            }
            
            // Se for PIX e ainda estiver pendente, verifica o status
            if (pagamento.metodo === PAYMENT_METHODS.PIX) {
                // Aqui você implementaria a lógica para verificar o status do PIX
                // com o provedor de pagamento externo
                // Por enquanto, retornamos o status atual
                return res.json({
                    success: true,
                    data: {
                        status: pagamento.status,
                        data_atualizacao: pagamento.data_atualizacao,
                        metodo_pagamento: pagamento.metodo,
                        valor: pagamento.valor,
                        reserva_id: reserva.id,
                        mensagem: 'Aguardando confirmação do pagamento'
                    }
                });
            }
            
            // Para outros métodos de pagamento, retorna o status atual
            res.json({
                success: true,
                data: {
                    status: pagamento.status,
                    data_atualizacao: pagamento.data_atualizacao,
                    metodo_pagamento: pagamento.metodo,
                    valor: pagamento.valor,
                    reserva_id: reserva.id
                }
            });
            
        } catch (error) {
            logger.error('Erro ao verificar status do pagamento:', {
                error: error.message,
                stack: error.stack,
                pagamentoId,
                userId
            });
            next(error);
        }
    }
    
    /**
     * Lista os pagamentos de um usuário
     * @route GET /api/payments/meus-pagamentos
     * @access Private
     */
    async listarMeusPagamentos(req, res, next) {
        const userId = req.user.id;
        const { limite = 10, pagina = 1 } = req.query;
        const offset = (pagina - 1) * limite;
        
        try {
            // Busca as reservas do usuário com paginação
            const { pagamentos, total } = await pagamentoModel.listarPorUsuario(
                userId, 
                parseInt(limite), 
                parseInt(offset)
            );
            
            // Formata os dados de resposta
            const pagamentosFormatados = await Promise.all(pagamentos.map(async (pagamento) => {
                const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
                const estacionamento = reserva ? await estacionamentoModel.findById(reserva.estacionamento_id) : null;
                
                return {
                    id: pagamento.id,
                    valor: pagamento.valor,
                    status: pagamento.status,
                    metodo_pagamento: pagamento.metodo,
                    data_criacao: pagamento.data_criacao,
                    data_atualizacao: pagamento.data_atualizacao,
                    reserva: reserva ? {
                        id: reserva.id,
                        horario_entrada: reserva.horario_entrada,
                        horario_saida: reserva.horario_saida,
                        status: reserva.status
                    } : null,
                    estacionamento: estacionamento ? {
                        id: estacionamento.id,
                        nome: estacionamento.nome,
                        endereco: estacionamento.endereco
                    } : null
                };
            }));
            
            res.json({
                success: true,
                data: {
                    pagamentos: pagamentosFormatados,
                    paginacao: {
                        total,
                        pagina: parseInt(pagina),
                        total_paginas: Math.ceil(total / limite),
                        itens_por_pagina: parseInt(limite)
                    }
                }
            });
            
        } catch (error) {
            logger.error('Erro ao listar pagamentos do usuário:', {
                error: error.message,
                stack: error.stack,
                userId
            });
            next(error);
        }
    }
    
    /**
     * Webhook para notificações de pagamento
     * @route POST /api/payments/webhook/:provedor
     * @access Public (protegido por assinatura)
     */
    async webhookPagamento(req, res, _next) {
        const { provedor } = req.params;
        const payload = req.body;
        const signature = req.headers['x-signature'] || req.headers['x-webhook-signature'];
        
        try {
            logger.info(`Recebido webhook do provedor ${provedor}`, { 
                provedor, 
                headers: req.headers,
                payload: JSON.stringify(payload).substring(0, 500) + '...' 
            });
            
            // Valida a assinatura do webhook (implemente de acordo com o provedor)
            const valido = await this.validarAssinaturaWebhook(provedor, payload, signature);
            
            if (!valido) {
                logger.warn('Assinatura de webhook inválida', { provedor, signature });
                throw new BadRequestError('Assinatura inválida');
            }
            
            // Processa o webhook de acordo com o provedor
            let resultado;
            
            switch (provedor.toLowerCase()) {
                case 'pix':
                    resultado = await this.processarWebhookPix(payload);
                    break;
                    
                case 'stripe':
                case 'pagarme':
                case 'pagseguro':
                    // Implemente outros provedores conforme necessário
                    resultado = { processado: false, mensagem: 'Provedor não implementado' };
                    break;
                    
                default:
                    throw new BadRequestError(`Provedor não suportado: ${provedor}`);
            }
            
            res.json({
                success: true,
                data: resultado
            });
            
        } catch (error) {
            logger.error('Erro ao processar webhook de pagamento:', {
                error: error.message,
                stack: error.stack,
                provedor,
                payload: JSON.stringify(payload).substring(0, 500) + '...',
                signature
            });
            
            // Responde com sucesso mesmo em caso de erro para evitar tentativas repetidas
            // (o provedor pode parar de enviar notificações se receber muitos erros)
            res.status(200).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Valida a assinatura de um webhook
     * @private
     */
    async validarAssinaturaWebhook(provedor, payload, signature) {
        // Implemente a validação de assinatura de acordo com o provedor
        // Esta é uma implementação de exemplo para PIX (Gerencianet)
        
        if (provedor.toLowerCase() === 'pix') {
            const chaveSecreta = process.env.PIX_WEBHOOK_SECRET;
            if (!chaveSecreta) {
                logger.warn('Chave secreta do webhook PIX não configurada');
                return false;
            }
            
            try {
                // Aqui você implementaria a lógica de validação da assinatura
                // Por exemplo, usando crypto para verificar a assinatura HMAC
                // Este é apenas um exemplo simplificado
                const crypto = require('crypto');
                const hmac = crypto.createHmac('sha256', chaveSecreta);
                const payloadString = JSON.stringify(payload);
                const assinaturaCalculada = `sha256=${hmac.update(payloadString).digest('hex')}`;
                
                return crypto.timingSafeEqual(
                    Buffer.from(signature),
                    Buffer.from(assinaturaCalculada)
                );
            } catch (error) {
                logger.error('Erro ao validar assinatura do webhook:', error);
                return false;
            }
        }
        
        // Para outros provedores, implemente a validação adequada
        return true; // Remova isso após implementar a validação real
    }
    
    /**
     * Processa um webhook de notificação PIX
     * @private
     */
    async processarWebhookPix(payload) {
        // Extrai o ID da transação do payload (ajuste conforme o formato do seu provedor)
        const txid = payload.pix?.[0]?.txid || payload.txid;
        
        if (!txid) {
            throw new BadRequestError('ID da transação não encontrado no payload');
        }
        
        logger.info(`Processando webhook PIX para transação ${txid}`);
        
        // Aqui você implementaria a lógica para processar a notificação PIX
        // Por exemplo, buscar o pagamento pelo txid e atualizar o status
        
        return {
            processado: true,
            txid,
            status: 'processado',
            mensagem: 'Webhook PIX processado com sucesso'
        };
    }
}

module.exports = new PaymentController();
