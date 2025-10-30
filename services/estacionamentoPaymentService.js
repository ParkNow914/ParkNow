const logger = require('../utils/logger');
const db = require('../config/database');
const { AppError } = require('../utils/AppError');
const { PIX_KEY_TYPES } = require('../config/constants');

class EstacionamentoPaymentService {
    /**
     * Atualiza as configurações de pagamento de um estacionamento
     * @param {number} estacionamentoId - ID do estacionamento
     * @param {Object} paymentConfig - Configurações de pagamento
     * @param {string} paymentConfig.tipo_chave_pix - Tipo da chave PIX (CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA)
     * @param {string} paymentConfig.chave_pix - Valor da chave PIX
     * @param {string} paymentConfig.nome_titular - Nome do titular da conta
     * @param {string} paymentConfig.banco - Nome do banco (opcional)
     * @param {string} paymentConfig.tipo_conta - Tipo de conta (CONTA_CORRENTE, CONTA_POUPANCA, CONTA_PAGAMENTO)
     * @param {string} paymentConfig.agencia - Número da agência (opcional)
     * @param {string} paymentConfig.conta - Número da conta (opcional)
     * @param {Object} client - Cliente de banco de dados opcional para transação
     * @returns {Promise<Object>} Configurações de pagamento atualizadas
     */
    async atualizarConfiguracaoPagamento(estacionamentoId, paymentConfig, client = db) {
        const {
            tipo_chave_pix,
            chave_pix,
            nome_titular,
            banco = null,
            tipo_conta = 'CONTA_CORRENTE',
            agencia = null,
            conta = null
        } = paymentConfig;

        // Validações
        if (!estacionamentoId) {
            throw new AppError('ID do estacionamento é obrigatório', 400);
        }

        if (!tipo_chave_pix || !PIX_KEY_TYPES.includes(tipo_chave_pix)) {
            throw new AppError(`Tipo de chave PIX inválido. Tipos aceitos: ${PIX_KEY_TYPES.join(', ')}`, 400);
        }

        if (!chave_pix) {
            throw new AppError('Chave PIX é obrigatória', 400);
        }

        if (!nome_titular) {
            throw new AppError('Nome do titular é obrigatório', 400);
        }

        try {
            // Verifica se o estacionamento existe
            const [estacionamento] = await client('estacionamentos')
                .where('id', estacionamentoId)
                .select('id');

            if (!estacionamento) {
                throw new AppError('Estacionamento não encontrado', 404);
            }

            // Verifica se já existe uma configuração de pagamento para este estacionamento
            const [configExistente] = await client('estacionamento_pagamentos')
                .where('estacionamento_id', estacionamentoId)
                .select('id');

            const dadosAtualizacao = {
                estacionamento_id: estacionamentoId,
                tipo_chave_pix,
                chave_pix,
                nome_titular,
                banco,
                tipo_conta,
                agencia,
                conta,
                data_atualizacao: client.fn.now()
            };

            let resultado;

            if (configExistente) {
                // Atualiza a configuração existente
                [resultado] = await client('estacionamento_pagamentos')
                    .where('id', configExistente.id)
                    .update(dadosAtualizacao)
                    .returning('*');
            } else {
                // Cria uma nova configuração
                [resultado] = await client('estacionamento_pagamentos')
                    .insert({
                        ...dadosAtualizacao,
                        data_criacao: client.fn.now()
                    })
                    .returning('*');
            }

            // Atualiza a chave PIX no cadastro do estacionamento para facilitar consultas
            await client('estacionamentos')
                .where('id', estacionamentoId)
                .update({
                    chave_pix: chave_pix,
                    data_atualizacao: client.fn.now()
                });

            logger.info(`Configuração de pagamento atualizada para o estacionamento ${estacionamentoId}`);
            return resultado;

        } catch (error) {
            logger.error('Erro ao atualizar configuração de pagamento:', {
                error: error.message,
                stack: error.stack,
                estacionamentoId,
                paymentConfig
            });
            throw error;
        }
    }

    /**
     * Obtém as configurações de pagamento de um estacionamento
     * @param {number} estacionamentoId - ID do estacionamento
     * @param {Object} client - Cliente de banco de dados opcional para transação
     * @returns {Promise<Object|null>} Configurações de pagamento ou null se não encontrado
     */
    async obterConfiguracaoPagamento(estacionamentoId, client = null) {
        try {
            const queryText = 'SELECT * FROM estacionamento_pagamentos WHERE estacionamento_id = $1 LIMIT 1';
            const values = [estacionamentoId];
            
            let result;
            if (client) {
                result = await client.query(queryText, values);
            } else {
                result = await db.query(queryText, values);
            }

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Erro ao obter configuração de pagamento:', {
                error: error.message,
                stack: error.stack,
                estacionamentoId
            });
            throw error;
        }
    }

    /**
     * Valida se um estacionamento está configurado para receber pagamentos
     * @param {number} estacionamentoId - ID do estacionamento
     * @param {Object} client - Cliente de banco de dados opcional para transação
     * @returns {Promise<{valido: boolean, motivo?: string}>} Resultado da validação
     */
    async validarConfiguracaoPagamento(estacionamentoId, client = db) {
        try {
            const configuracao = await this.obterConfiguracaoPagamento(estacionamentoId, client);
            
            if (!configuracao) {
                return { 
                    valido: false, 
                    motivo: 'Estacionamento não possui configuração de pagamento' 
                };
            }
            
            if (!configuracao.chave_pix) {
                return { 
                    valido: false, 
                    motivo: 'Chave PIX não configurada' 
                };
            }
            
            if (!configuracao.nome_titular) {
                return { 
                    valido: false, 
                    motivo: 'Nome do titular não informado' 
                };
            }
            
            return { valido: true };
            
        } catch (error) {
            logger.error('Erro ao validar configuração de pagamento:', {
                error: error.message,
                stack: error.stack,
                estacionamentoId
            });
            
            return { 
                valido: false, 
                motivo: 'Erro ao validar configuração de pagamento',
                erro: error.message
            };
        }
    }
}

module.exports = new EstacionamentoPaymentService();
