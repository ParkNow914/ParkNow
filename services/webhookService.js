const crypto = require('crypto');
const logger = require('../utils/logger');
const { PAYMENT_STATUS } = require('../config/constants');
const pagamentoModel = require('../models/pagamentoModel');
const reservaModel = require('../models/reservaModel');
const notificationService = require('./notificationService');
const pool = require('../models/db'); // Pool pg para transações em processWebhookEvent

class WebhookService {
    constructor() {
        this.providers = new Map();
    }

    /**
     * Registra um novo provedor de webhook
     * @param {string} nome - Nome do provedor
     * @param {Object} config - Configurações do provedor
     * @param {Function} config.validarAssinatura - Função para validar a assinatura do webhook
     * @param {Function} config.processarEvento - Função para processar o evento do webhook
     */
    registrarProvedor(nome, config) {
        if (this.providers.has(nome)) {
            logger.warn(`Provedor ${nome} já registrado. Sobrescrevendo configurações.`);
        }
        this.providers.set(nome, config);
        logger.info(`Provedor de webhook registrado: ${nome}`);
    }

    /**
     * Processa um webhook recebido
     * @param {string} providerName - Nome do provedor
     * @param {Object} request - Objeto de requisição do Express
     * @returns {Promise<Object>} Resposta do processamento
     */
    async processarWebhook(providerName, request) {
        const provider = this.providers.get(providerName);
        
        if (!provider) {
            logger.error(`Provedor de webhook não encontrado: ${providerName}`);
            throw new Error('Provedor não suportado');
        }

        try {
            // Valida a assinatura do webhook
            const isValid = await provider.validarAssinatura(request);
            
            if (!isValid) {
                logger.warn(`Assinatura inválida para webhook do provedor: ${providerName}`);
                throw new Error('Assinatura inválida');
            }

            // Processa o evento do webhook
            const resultado = await provider.processarEvento(request.body);
            
            // Atualiza o status do pagamento se necessário
            if (resultado.pagamentoId && resultado.novoStatus) {
                await this.atualizarStatusPagamento(
                    resultado.pagamentoId, 
                    resultado.novoStatus,
                    resultado.detalhes
                );
            }

            
            return { success: true, data: resultado };
            
        } catch (error) {
            logger.error(`Erro ao processar webhook do provedor ${providerName}:`, error);
            throw error;
        }
    }


    /**
     * Atualiza o status de um pagamento e notifica as partes interessadas
     * @param {number} pagamentoId - ID do pagamento
     * @param {string} novoStatus - Novo status do pagamento
     * @param {Object} [detalhes] - Detalhes adicionais do status
     * @returns {Promise<void>}
     */
    async atualizarStatusPagamento(pagamentoId, novoStatus, detalhes = {}) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Busca o pagamento com bloqueio para evitar condições de corrida
            const pagamento = await pagamentoModel.buscarPorIdComPermissao(pagamentoId);
            
            if (!pagamento) {
                throw new Error(`Pagamento não encontrado: ${pagamentoId}`);
            }
            
            // Atualiza o status do pagamento
            await pagamentoModel.atualizarStatusComMotivo(
                pagamentoId,
                novoStatus,
                `Status atualizado via webhook: ${detalhes.motivo || 'Sem motivo informado'}`,
                { detalhes }
            );
            
            // Se o pagamento for aprovado, atualiza o status da reserva
            if (novoStatus === PAYMENT_STATUS.APROVADO) {
                await reservaModel.atualizarStatus(
                    pagamento.reserva_id,
                    'confirmada',
                    'Pagamento confirmado'
                );
                
                // Notifica o usuário sobre o pagamento aprovado
                await notificationService.enviarNotificacaoPagamentoAprovado(
                    pagamento.usuario_id,
                    pagamento.reserva_id,
                    pagamento.valor
                );
            }
            
            // Se o pagamento for recusado ou falhar
            if ([PAYMENT_STATUS.RECUSADO, PAYMENT_STATUS.CANCELADO, PAYMENT_STATUS.EXPIRADO].includes(novoStatus)) {
                // Atualiza o status da reserva para cancelada
                await reservaModel.atualizarStatus(
                    pagamento.reserva_id,
                    'cancelada',
                    `Pagamento ${novoStatus.toLowerCase()}`
                );
                
                // Notifica o usuário sobre a falha no pagamento
                await notificationService.enviarNotificacaoPagamentoFalhou(
                    pagamento.usuario_id,
                    pagamento.reserva_id,
                    novoStatus,
                    detalhes.mensagem || 'Não foi possível processar seu pagamento.'
                );
            }
            
            await client.query('COMMIT');
            
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Erro ao atualizar status do pagamento ${pagamentoId}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Registra os provedores de webhook padrão
     */
    registrarProvedoresPadrao() {
        // Provedor PIX (exemplo com Gerencianet)
        this.registrarProvedor('pix', {
            validarAssinatura: async (req) => {
                // Implementar validação de assinatura do webhook da Gerencianet
                // Exemplo: verificar assinatura HMAC-SHA256
                const signature = req.headers['x-gnet-sha256'];
                if (!signature) return false;
                
                const secret = process.env.GERENCIANET_WEBHOOK_SECRET;
                const payload = JSON.stringify(req.body);
                
                const hmac = crypto.createHmac('sha256', secret);
                const calculatedSignature = hmac.update(payload).digest('hex');
                
                return crypto.timingSafeEqual(
                    Buffer.from(signature),
                    Buffer.from(calculatedSignature)
                );
            },
            
            processarEvento: async (evento) => {
                // Implementar lógica de processamento do evento PIX
                // Exemplo: verificar o status da transação PIX
                const { pix } = evento;
                
                if (!pix || !pix.length) {
                    throw new Error('Nenhum dado PIX encontrado no evento');
                }
                
                const transacao = pix[0];
                const txid = transacao.txid;
                
                // Busca o pagamento pelo ID da transação
                const pagamento = await pagamentoModel.buscarPorTransacaoId(txid);
                
                if (!pagamento) {
                    logger.warn(`Pagamento não encontrado para a transação: ${txid}`);
                    return { processado: false, motivo: 'Pagamento não encontrado' };
                }
                
                // Mapeia o status do provedor para o status interno
                let status;
                switch (transacao.status) {
                    case 'CONCLUIDA':
                        status = PAYMENT_STATUS.APROVADO;
                        break;
                    case 'ATIVA':
                        status = PAYMENT_STATUS.PROCESSANDO;
                        break;
                    case 'REMOVIDA_PELO_USUARIO_RECEBEDOR':
                    case 'REMOVIDA_PELO_PSP':
                        status = PAYMENT_STATUS.CANCELADO;
                        break;
                    case 'REMOVIDA_PELO_USUARIO_DEVIDOR':
                        status = PAYMENT_STATUS.ESTORNADO;
                        break;
                    default:
                        status = PAYMENT_STATUS.PENDENTE;
                }
                
                return {
                    pagamentoId: pagamento.id,
                    novoStatus: status,
                    detalhes: {
                        motivo: `Status atualizado pelo provedor PIX: ${transacao.status}`,
                        dataAtualizacao: new Date().toISOString(),
                        dadosTransacao: transacao
                    }
                };
            }
        });

        // Adicione outros provedores conforme necessário (ASAAS, Pagar.me, etc.)
    }
}

// Exporta uma instância singleton do serviço
const webhookService = new WebhookService();
webhookService.registrarProvedoresPadrao();

module.exports = webhookService;
