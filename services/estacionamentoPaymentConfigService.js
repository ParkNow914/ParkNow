const db = require('../config/database');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');
const { PIX_KEY_TYPES, BANK_ACCOUNT_TYPES } = require('../config/constants');

class EstacionamentoPaymentConfigService {
  /**
   * Atualiza as configurações de pagamento de um estacionamento
   * @param {number} estacionamentoId - ID do estacionamento
   * @param {Object} config - Configurações de pagamento
   * @param {string} config.tipo_chave_pix - Tipo da chave PIX (CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA)
   * @param {string} config.chave_pix - Valor da chave PIX
   * @param {string} config.nome_titular - Nome do titular da conta
   * @param {string} [config.banco] - Nome do banco (opcional)
   * @param {string} [config.tipo_conta=CONTA_CORRENTE] - Tipo de conta (CONTA_CORRENTE, CONTA_POUPANCA, CONTA_PAGAMENTO)
   * @param {string} [config.agencia] - Número da agência (opcional)
   * @param {string} [config.conta] - Número da conta (opcional)
   * @returns {Promise<Object>} Configurações atualizadas
   */
  async atualizarConfiguracaoPagamento(estacionamentoId, config) {
    const {
      tipo_chave_pix,
      chave_pix,
      nome_titular,
      banco = null,
      tipo_conta = 'CONTA_CORRENTE',
      agencia = null,
      conta = null
    } = config;

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

    // Valida tipo de conta, se fornecido
    if (tipo_conta && !BANK_ACCOUNT_TYPES.includes(tipo_conta)) {
      throw new AppError(`Tipo de conta inválido. Tipos aceitos: ${BANK_ACCOUNT_TYPES.join(', ')}`, 400);
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Verifica se o estacionamento existe
      const estacionamentoResult = await client.query(
        'SELECT id FROM estacionamentos WHERE id = $1',
        [estacionamentoId]
      );

      if (estacionamentoResult.rows.length === 0) {
        throw new AppError('Estacionamento não encontrado', 404);
      }

      // Verifica se já existe uma configuração de pagamento para este estacionamento
      const configExistenteResult = await client.query(
        'SELECT id FROM estacionamento_pagamentos WHERE estacionamento_id = $1',
        [estacionamentoId]
      );

      const dadosAtualizacao = {
        estacionamento_id: estacionamentoId,
        tipo_chave_pix,
        chave_pix,
        nome_titular,
        banco,
        tipo_conta,
        agencia,
        conta,
        data_atualizacao: new Date()
      };

      let resultado;

      if (configExistenteResult.rows.length > 0) {
        // Atualiza a configuração existente
        const updateQuery = `
          UPDATE estacionamento_pagamentos
          SET 
            tipo_chave_pix = $1,
            chave_pix = $2,
            nome_titular = $3,
            banco = $4,
            tipo_conta = $5,
            agencia = $6,
            conta = $7,
            data_atualizacao = $8
          WHERE estacionamento_id = $9
          RETURNING *
        `;

        const updateValues = [
          tipo_chave_pix,
          chave_pix,
          nome_titular,
          banco,
          tipo_conta,
          agencia,
          conta,
          new Date(),
          estacionamentoId
        ];

        resultado = await client.query(updateQuery, updateValues);
      } else {
        // Cria uma nova configuração
        const insertQuery = `
          INSERT INTO estacionamento_pagamentos (
            estacionamento_id, tipo_chave_pix, chave_pix, nome_titular, 
            banco, tipo_conta, agencia, conta, data_criacao, data_atualizacao
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `;

        const insertValues = [
          estacionamentoId,
          tipo_chave_pix,
          chave_pix,
          nome_titular,
          banco,
          tipo_conta,
          agencia,
          conta,
          new Date(),
          new Date()
        ];

        resultado = await client.query(insertQuery, insertValues);
      }

      // Atualiza a chave PIX no cadastro do estacionamento para facilitar consultas
      await client.query(
        'UPDATE estacionamentos SET chave_pix = $1, tipo_chave_pix = $2, nome_titular_pix = $3, data_atualizacao = $4 WHERE id = $5',
        [chave_pix, tipo_chave_pix, nome_titular, new Date(), estacionamentoId]
      );

      await client.query('COMMIT');

      return resultado.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Erro ao atualizar configuração de pagamento:', error);
      
      if (error.code === '23505') { // Violação de chave única
        throw new AppError('Já existe uma configuração de pagamento para este estacionamento', 400);
      }
      
      throw new AppError('Erro ao processar configuração de pagamento', 500);
    } finally {
      client.release();
    }
  }

  /**
   * Obtém as configurações de pagamento de um estacionamento
   * @param {number} estacionamentoId - ID do estacionamento
   * @returns {Promise<Object|null>} Configurações de pagamento ou null se não encontrado
   */
  async obterConfiguracaoPagamento(estacionamentoId) {
    try {
      const query = `
        SELECT 
          ep.*,
          e.chave_pix as chave_pix_atual,
          e.tipo_chave_pix as tipo_chave_pix_atual,
          e.nome_titular_pix as nome_titular_pix_atual
        FROM estacionamento_pagamentos ep
        LEFT JOIN estacionamentos e ON e.id = ep.estacionamento_id
        WHERE ep.estacionamento_id = $1
        LIMIT 1
      `;

      const { rows } = await db.query(query, [estacionamentoId]);
      
      if (rows.length === 0) {
        // Se não encontrou configuração, verifica se existe chave PIX no cadastro do estacionamento
        const estacionamentoQuery = `
          SELECT 
            chave_pix, 
            tipo_chave_pix, 
            nome_titular_pix as nome_titular
          FROM estacionamentos 
          WHERE id = $1
        `;
        
        const estacionamentoResult = await db.query(estacionamentoQuery, [estacionamentoId]);
        
        if (estacionamentoResult.rows.length === 0) {
          return null;
        }
        
        const estacionamento = estacionamentoResult.rows[0];
        
        if (!estacionamento.chave_pix) {
          return null;
        }
        
        // Retorna um objeto com os dados básicos do estacionamento
        return {
          estacionamento_id: estacionamentoId,
          tipo_chave_pix: estacionamento.tipo_chave_pix,
          chave_pix: estacionamento.chave_pix,
          nome_titular: estacionamento.nome_titular,
          tipo_conta: 'CONTA_CORRENTE',
          data_criacao: new Date(),
          data_atualizacao: new Date()
        };
      }
      
      return rows[0];
    } catch (error) {
      logger.error('Erro ao obter configuração de pagamento:', error);
      throw new AppError('Erro ao buscar configuração de pagamento', 500);
    }
  }

  /**
   * Verifica se um estacionamento está configurado para receber pagamentos
   * @param {number} estacionamentoId - ID do estacionamento
   * @returns {Promise<{valido: boolean, motivo?: string, config?: object}>}
   */
  async validarConfiguracaoPagamento(estacionamentoId) {
    try {
      const config = await this.obterConfiguracaoPagamento(estacionamentoId);
      
      if (!config) {
        return { 
          valido: false, 
          motivo: 'Nenhuma configuração de pagamento encontrada para este estacionamento' 
        };
      }
      
      // Verifica se a chave PIX está configurada
      if (!config.chave_pix || !config.tipo_chave_pix) {
        return { 
          valido: false, 
          motivo: 'Chave PIX não configurada',
          config
        };
      }
      
      // Verifica se o nome do titular está preenchido
      if (!config.nome_titular) {
        return { 
          valido: false, 
          motivo: 'Nome do titular não informado',
          config
        };
      }
      
      // Verifica se o tipo de chave PIX é válido
      const tiposValidos = ['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'];
      if (!tiposValidos.includes(config.tipo_chave_pix)) {
        return { 
          valido: false, 
          motivo: `Tipo de chave PIX inválido. Tipos aceitos: ${tiposValidos.join(', ')}`,
          config
        };
      }
      
      return { 
        valido: true,
        config
      };
    } catch (error) {
      logger.error('Erro ao validar configuração de pagamento:', error);
      return { 
        valido: false, 
        motivo: 'Erro ao validar configuração de pagamento',
        error: error.message 
      };
    }
  }
}

module.exports = new EstacionamentoPaymentConfigService();
