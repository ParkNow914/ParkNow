const estacionamentoPaymentConfigService = require('../services/estacionamentoPaymentConfigService');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');
const validatePixKey = require('../middleware/validatePixKey');
const pool = require('../models/db'); // Pool pg para consulta direta em verificarPropriedadeEstacionamento

class EstacionamentoPaymentConfigController {
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
        throw new AppError('Você não tem permissão para atualizar configurações de pagamento', 403);
      }
      
      // Valida os dados da requisição
      const {
        tipo_chave_pix,
        chave_pix,
        nome_titular,
        banco,
        tipo_conta = 'CONTA_CORRENTE',
        agencia,
        conta
      } = req.body;
      
      // Validação básica
      if (!tipo_chave_pix || !chave_pix || !nome_titular) {
        throw new AppError('Campos obrigatórios não informados', 400);
      }
      
      // Se for um usuário do tipo 'estacionamento', verifica se ele é o dono
      if (userRole === 'estacionamento') {
        const isOwner = await this.verificarPropriedadeEstacionamento(userId, estacionamentoId);
        if (!isOwner) {
          throw new AppError('Você não tem permissão para atualizar as configurações deste estacionamento', 403);
        }
      }
      
      // Valida a chave PIX
      validatePixKey(req, res, () => {});
      
      // Atualiza as configurações
      const configuracao = await estacionamentoPaymentConfigService.atualizarConfiguracaoPagamento(
        estacionamentoId,
        {
          tipo_chave_pix,
          chave_pix: req.body.chave_pix, // Usa o valor já validado pelo middleware
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
          throw new AppError('Você não tem permissão para visualizar as configurações deste estacionamento', 403);
        }
      }
      
      // Obtém as configurações
      const configuracao = await estacionamentoPaymentConfigService.obterConfiguracaoPagamento(estacionamentoId);
      
      if (!configuracao) {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'Nenhuma configuração de pagamento encontrada para este estacionamento'
        });
      }
      
      res.status(200).json({
        success: true,
        data: configuracao
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Verifica se um estacionamento está configurado para receber pagamentos
   * @param {Object} req - Requisição HTTP
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   */
  async validarConfiguracaoPagamento(req, res, next) {
    const { id: estacionamentoId } = req.params;
    
    try {
      const { valido, motivo, config } = await estacionamentoPaymentConfigService.validarConfiguracaoPagamento(estacionamentoId);
      
      res.status(200).json({
        success: true,
        data: {
          valido,
          motivo: motivo || null,
          config: config || null
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Verifica se o usuário é dono do estacionamento
   * @private
   * @param {number} userId - ID do usuário
   * @param {number} estacionamentoId - ID do estacionamento
   * @returns {Promise<boolean>} Verdadeiro se o usuário for dono do estacionamento
   */
  async verificarPropriedadeEstacionamento(userId, estacionamentoId) {
    try {
      const query = 'SELECT 1 FROM estacionamentos WHERE id = $1 AND admin_id = $2';
      const { rows } = await pool.query(query, [estacionamentoId, userId]);
      return rows.length > 0;
    } catch (error) {
      logger.error('Erro ao verificar propriedade do estacionamento:', error);
      return false;
    }
  }
}

module.exports = new EstacionamentoPaymentConfigController();
