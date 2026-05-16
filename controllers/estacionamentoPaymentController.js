const estacionamentoPaymentService = require('../services/estacionamentoPaymentService');
const { AppError: _AppError, UnauthorizedError, BadRequestError } = require('../utils/AppError');
const logger = require('../utils/logger');
const { PAYMENT_METHODS, BANK_ACCOUNT_TYPES } = require('../config/constants');
const pool = require('../models/db'); // Pool pg para verificarPropriedadeEstacionamento

class EstacionamentoPaymentController {
    /**
     * Atualiza as configurações de pagamento de um estacionamento
     * @param {Object} req - Requisição HTTP
     * @param {Object} res - Resposta HTTP
     * @param {Function} next - Próximo middleware
     */
    async atualizarConfiguracaoPagamento(req, res, next) {
        const { id: estacionamentoId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        try {
            // Verifica se o usuário tem permissão para atualizar as configurações
            if (userRole !== 'admin' && userRole !== 'estacionamento') {
                throw new UnauthorizedError('Você não tem permissão para atualizar configurações de pagamento');
            }
            
            const {
                tipo_chave_pix,
                chave_pix,
                nome_titular,
                banco,
                tipo_conta = 'CONTA_CORRENTE',
                agencia,
                conta
            } = req.body;
            
            // Validações básicas
            if (!tipo_chave_pix || !chave_pix || !nome_titular) {
                throw new BadRequestError('Campos obrigatórios não informados');
            }
            
            // Se for um usuário do tipo 'estacionamento', verifica se ele é o dono
            if (userRole === 'estacionamento') {
                const isOwner = await this.verificarPropriedadeEstacionamento(userId, estacionamentoId);
                if (!isOwner) {
                    throw new UnauthorizedError('Você não tem permissão para atualizar as configurações deste estacionamento');
                }
            }
            
            // Atualiza as configurações
            const configuracao = await estacionamentoPaymentService.atualizarConfiguracaoPagamento(
                estacionamentoId,
                {
                    tipo_chave_pix,
                    chave_pix,
                    nome_titular,
                    banco,
                    tipo_conta,
                    agencia,
                    conta
                }
            );
            
            res.status(200).json({
                success: true,
                data: configuracao
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * Obtém as configurações de pagamento de um estacionamento
     * @param {Object} req - Requisição HTTP
     * @param {Object} res - Resposta HTTP
     * @param {Function} next - Próximo middleware
     */
    async obterConfiguracaoPagamento(req, res, next) {
        const { id: estacionamentoId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        try {
            // Se for um usuário do tipo 'estacionamento', verifica se ele é o dono
            if (userRole === 'estacionamento') {
                const isOwner = await this.verificarPropriedadeEstacionamento(userId, estacionamentoId);
                if (!isOwner) {
                    throw new UnauthorizedError('Você não tem permissão para visualizar as configurações deste estacionamento');
                }
            }
            
            // Obtém as configurações
            const configuracao = await estacionamentoPaymentService.obterConfiguracaoPagamento(estacionamentoId);
            
            if (!configuracao) {
                return res.status(200).json({
                    success: true,
                    data: null,
                    message: 'Nenhuma configuração de pagamento encontrada para este estacionamento'
                });
            }
            
            // Remove dados sensíveis antes de retornar
            const { chave_pix, ...dadosSeguros } = configuracao;
            
            res.status(200).json({
                success: true,
                data: {
                    ...dadosSeguros,
                    possui_chave_pix: !!chave_pix
                }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    /**
     * Obtém as opções disponíveis para configuração de pagamento
     * @param {Object} req - Requisição HTTP
     * @param {Object} res - Resposta HTTP
     */
    obterOpcoesConfiguracao(req, res) {
        res.status(200).json({
            success: true,
            data: {
                tipos_chave_pix: Object.values(PAYMENT_METHODS),
                tipos_conta: Object.values(BANK_ACCOUNT_TYPES),
                metodos_pagamento: Object.values(PAYMENT_METHODS)
            }
        });
    }
    
    /**
     * Verifica se um usuário é dono de um estacionamento
     * @private
     * @param {number} userId - ID do usuário
     * @param {number} estacionamentoId - ID do estacionamento
     * @returns {Promise<boolean>} Verdadeiro se o usuário for dono do estacionamento
     */
    async verificarPropriedadeEstacionamento(userId, estacionamentoId) {
        try {
            // Verifica se o usuário (admin) é dono do estacionamento via pool pg.
            const { rows } = await pool.query(
                'SELECT 1 FROM estacionamentos WHERE id = $1 AND admin_id = $2 LIMIT 1',
                [estacionamentoId, userId]
            );
            return rows.length > 0;
        } catch (error) {
            logger.error('Erro ao verificar propriedade do estacionamento:', {
                error: error.message,
                userId,
                estacionamentoId
            });
            return false;
        }
    }
}

module.exports = new EstacionamentoPaymentController();
