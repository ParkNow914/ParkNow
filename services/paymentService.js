const logger = require('../utils/logger');
const config = require('../config');
const reservaModel = require('../models/reservaModel');
const pagamentoModel = require('../models/pagamentoModel');
const notificationService = require('./notificationService');
const estacionamentoModel = require('../models/estacionamentoModel');
const { pool } = require('../utils/dbUtils');
const { PAGAMENTO_STATUS } = require('../models/pagamentoModel');

class PaymentService {
    /**
     * Processa uma notificação de pagamento recebida via webhook
     * @param {Object} paymentData - Dados do pagamento
     * @returns {Promise<Object>} Resultado do processamento
     */
    async processarNotificacaoPagamento(paymentData) {
        let client;
        
        try {
            // Inicia uma transação
            client = await pool.connect();
            await client.query('BEGIN');
            
            const { txid, status, valor, dataPagamento } = this.extrairDadosPagamento(paymentData);
            
            // Busca a reserva pelo TXID
            const reserva = await reservaModel.findByTxid(txid, client);
            if (!reserva) {
                throw new Error(`Reserva não encontrada para o TXID: ${txid}`);
            }
            
            // Busca o último pagamento da reserva
            const pagamento = await pagamentoModel.buscarUltimoPagamentoPorReserva(reserva.id, client);
            if (!pagamento) {
                throw new Error(`Nenhum pagamento encontrado para a reserva: ${reserva.id}`);
            }
            
            // Verifica se o status já está atualizado
            if (pagamento.status === this.mapearStatusPix(status)) {
                logger.info(`Status do pagamento já está atualizado para: ${status}`);
                await client.query('ROLLBACK');
                return { success: true, message: 'Status já está atualizado' };
            }
            
            // Atualiza o status do pagamento
            await pagamentoModel.atualizarStatusPagamento(
                pagamento.id,
                this.mapearStatusPix(status),
                { 
                    dados_notificacao: paymentData,
                    data_atualizacao: new Date()
                },
                client
            );
            
            // Se o pagamento foi confirmado, atualiza o status da reserva
            if (status === 'CONCLUIDA' || status === 'APROVADA') {
                await reservaModel.atualizarStatus(reserva.id, 'confirmada', client);
                
                // Busca os detalhes do estacionamento para a notificação
                const estacionamento = await estacionamentoModel.findById(reserva.estacionamento_id, client);
                
                // Envia notificação para o usuário
                await notificationService.enviarNotificacao(
                    reserva.usuario_id,
                    {
                        tipo: 'pagamento_aprovado',
                        titulo: 'Pagamento Aprovado',
                        mensagem: `Seu pagamento de R$ ${(valor / 100).toFixed(2)} para o estacionamento ${estacionamento?.nome || ''} foi aprovado com sucesso!`,
                        dados: {
                            reserva_id: reserva.id,
                            valor: valor / 100,
                            data_pagamento: dataPagamento,
                            estacionamento_nome: estacionamento?.nome,
                            estacionamento_endereco: estacionamento?.endereco
                        }
                    }
                );
                
                // TODO: Enviar e-mail de confirmação
            } else if (status === 'ESTORNADO' || status === 'DEVOLVIDO') {
                await reservaModel.atualizarStatus(reserva.id, 'cancelada', client);
                
                // Envia notificação para o usuário
                await notificationService.enviarNotificacao(
                    reserva.usuario_id,
                    {
                        tipo: 'pagamento_estornado',
                        titulo: 'Estorno de Pagamento',
                        mensagem: 'Seu pagamento foi estornado e a reserva foi cancelada.',
                        dados: {
                            reserva_id: reserva.id,
                            valor: valor / 100,
                            data_estorno: new Date().toISOString()
                        }
                    }
                );
            }
            
            // Confirma a transação
            await client.query('COMMIT');
            
            logger.info(`Pagamento processado com sucesso para a reserva ${reserva.id}`, { 
                status,
                valor,
                txid 
            });
            
            return { 
                success: true, 
                reserva_id: reserva.id,
                status: this.mapearStatusPix(status),
                valor,
                txid
            };
            
        } catch (error) {
            // Desfaz as alterações em caso de erro
            if (client) {
                await client.query('ROLLBACK');
            }
            
            logger.error('Erro ao processar notificação de pagamento:', {
                error: error.message,
                stack: error.stack,
                paymentData
            });
            
            throw error;
            
        } finally {
            // Libera o cliente de volta para o pool
            if (client) {
                client.release();
            }
        }
    }
    
    /**
     * Extrai os dados relevantes do pagamento da notificação
     * @param {Object} paymentData - Dados brutos da notificação
     * @returns {Object} Dados estruturados do pagamento
     */
    extrairDadosPagamento(paymentData) {
        // Implementação para extrair dados de diferentes provedores de pagamento
        if (paymentData.pix) {
            // Formato Gerencianet
            const pix = paymentData.pix[0];
            return {
                txid: pix.txid,
                status: paymentData.status,
                valor: pix.valor,
                dataPagamento: pix.horario ? new Date(pix.horario) : new Date()
            };
        } else if (paymentData.data && paymentData.data.id) {
            // Formato ASAAS ou outro gateway
            return {
                txid: paymentData.data.id,
                status: paymentData.data.status.toUpperCase(),
                valor: paymentData.data.transaction_amount * 100, // Converte para centavos
                dataPagamento: paymentData.data.date_approved 
                    ? new Date(paymentData.data.date_approved) 
                    : new Date()
            };
        } else {
            // Formato genérico
            return {
                txid: paymentData.txid || paymentData.id || paymentData.reference_id,
                status: paymentData.status || 'PENDENTE',
                valor: paymentData.valor || paymentData.amount || 0,
                dataPagamento: paymentData.data_pagamento || paymentData.date_approved || new Date()
            };
        }
    }
    
    /**
     * Mapeia o status do provedor de pagamento para o status interno
     * @param {string} statusExterno - Status do provedor de pagamento
     * @returns {string} Status interno
     */
    mapearStatusPix(statusExterno) {
        if (!statusExterno) return PAGAMENTO_STATUS.PENDENTE;
        
        const status = statusExterno.toUpperCase();
        
        switch (status) {
            case 'CONCLUIDA':
            case 'APROVADA':
            case 'PAID':
            case 'APPROVED':
                return PAGAMENTO_STATUS.APROVADO;
                
            case 'PENDENTE':
            case 'PENDING':
            case 'EM_PROCESSAMENTO':
                return PAGAMENTO_STATUS.PENDENTE;
                
            case 'ESTORNADO':
            case 'DEVOLVIDO':
            case 'REFUNDED':
                return PAGAMENTO_STATUS.ESTORNADO;
                
            case 'CANCELADA':
            case 'CANCELLED':
                return PAGAMENTO_STATUS.CANCELADO;
                
            case 'RECUSADA':
            case 'REJECTED':
            case 'DECLINED':
                return PAGAMENTO_STATUS.RECUSADO;
                
            default:
                logger.warn(`Status de pagamento não mapeado: ${status}`);
                return PAGAMENTO_STATUS.PENDENTE;
        }
    }
    
    /**
     * Cria uma nova cobrança PIX
     * @param {number} reservaId - ID da reserva
     * @param {number} valor - Valor em centavos
     * @param {string} descricao - Descrição do pagamento
     * @param {Object} [client] - Cliente de banco de dados opcional para transação
     * @returns {Promise<Object>} Dados da cobrança
     */
    async criarCobrancaPix(reservaId, valor, descricao, client = pool) {
        try {
            // Verifica se já existe um pagamento pendente para esta reserva
            const pagamentoExistente = await pagamentoModel.buscarUltimoPagamentoPorReserva(reservaId, client);
            
            if (pagamentoExistente && pagamentoExistente.status === PAGAMENTO_STATUS.PENDENTE) {
                // Verifica se o pagamento ainda é válido (não expirado)
                const dataCriacao = new Date(pagamentoExistente.data_criacao);
                const expiracao = config.pix.chargeExpiresIn || 3600; // segundos
                const dataExpiracao = new Date(dataCriacao.getTime() + (expiracao * 1000));
                
                if (new Date() < dataExpiracao) {
                    // Retorna os dados do pagamento existente
                    return {
                        id: pagamentoExistente.id,
                        txid: pagamentoExistente.dados_retorno?.txid,
                        qr_code: pagamentoExistente.dados_retorno?.qr_code,
                        qr_code_text: pagamentoExistente.dados_retorno?.qr_code_text,
                        valor: pagamentoExistente.valor,
                        expiracao: Math.floor((dataExpiracao - new Date()) / 1000), // segundos restantes
                        status: pagamentoExistente.status
                    };
                }
                
                // Se o pagamento expirou, marca como expirado
                await pagamentoModel.atualizarStatusPagamento(
                    pagamentoExistente.id,
                    PAGAMENTO_STATUS.EXPIRADO,
                    { motivo: 'Pagamento expirado' },
                    client
                );
            }
            
            // Cria um novo pagamento
            const txid = `PARKNOW${Date.now()}${Math.floor(Math.random() * 1000)}`;
            const expiracao = config.pix.chargeExpiresIn || 3600; // segundos
            const dataExpiracao = new Date(Date.now() + (expiracao * 1000));
            
            const pagamentoId = await pagamentoModel.criarPagamento({
                reserva_id: reservaId,
                metodo: 'pix',
                valor: valor,
                status: PAGAMENTO_STATUS.PENDENTE,
                dados_adicionais: {
                    txid,
                    descricao,
                    data_expiracao: dataExpiracao.toISOString(),
                    tentativas: 0
                }
            }, client);
            
            // Implementar chamada para API do ASAAS ou outro gateway PIX
            const qrCodeData = this.gerarQrCodeSimulado(txid, valor, descricao);
            
            // Atualiza o pagamento com os dados do QR Code
            await pagamentoModel.atualizarStatusPagamento(
                pagamentoId,
                PAGAMENTO_STATUS.PENDENTE,
                {
                    qr_code: qrCodeData.qr_code,
                    qr_code_text: qrCodeData.qr_code_text,
                    chave_pix: qrCodeData.chave_pix,
                    nome_titular: qrCodeData.nome_titular
                },
                client
            );
            
            return {
                id: pagamentoId,
                txid,
                qr_code: qrCodeData.qr_code,
                qr_code_text: qrCodeData.qr_code_text,
                chave_pix: qrCodeData.chave_pix,
                nome_titular: qrCodeData.nome_titular,
                valor,
                expiracao,
                status: PAGAMENTO_STATUS.PENDENTE
            };
            
        } catch (error) {
            logger.error('Erro ao criar cobrança PIX:', {
                error: error.message,
                stack: error.stack,
                reservaId,
                valor,
                descricao
            });
            throw error;
        }
    }
    
    /**
     * Gera dados simulados de QR Code para PIX (apenas para desenvolvimento)
     * @private
     */
    gerarQrCodeSimulado(txid, valor, descricao) {
        // Em produção, isso seria gerado pela API do provedor de pagamento
        return {
            qr_code: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`PIX:${txid}`)}`,
            qr_code_text: `00020126330014BR.GOV.BCB.PIX0111${txid}5204000053039865802BR5913PARKNOW S.A.6008BRASILIA62070503***6304`,
            chave_pix: 'parknow@email.com',
            nome_titular: 'PARKNOW S.A.',
            txid,
            valor,
            descricao
        };
    }
}

module.exports = new PaymentService();
