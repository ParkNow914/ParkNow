const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class PaymentModel {
  /**
   * Inicia uma transação no banco de dados
   * @returns {Promise<Object>} Objeto de transação
   */
  async startTransaction() {
    const client = await getClient();
    await client.query('BEGIN');
    return client;
  }
  /**
   * Cria um novo pagamento no banco de dados
   * @param {Object} paymentData - Dados do pagamento
   * @param {Object} options - Opções adicionais (transação, etc.)
   * @returns {Promise<Object>} Pagamento criado
   */
  async create(paymentData, options = {}) {
    const {
      id,
      external_reference,
      user_id,
      parking_id,
      amount,
      platform_amount,
      parking_amount,
      platform_fee,
      payment_method,
      status = 'pending',
      status_detail = null,
      metadata = {}
    } = paymentData;

    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      if (!options.transaction) {
        await client.query('BEGIN');
      }

      const result = await client.query(
        `INSERT INTO pagamentos (
          id, external_reference, user_id, parking_id, amount, 
          platform_amount, parking_amount, platform_fee, 
          payment_method, status, status_detail, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
        RETURNING *`,
        [
          id,
          external_reference,
          user_id,
          parking_id,
          parseFloat(amount),
          platform_amount ? parseFloat(platform_amount) : null,
          parking_amount ? parseFloat(parking_amount) : null,
          platform_fee ? parseFloat(platform_fee) : null,
          payment_method,
          status,
          status_detail,
          metadata
        ]
      );

      if (!options.transaction) {
        await client.query('COMMIT');
      }

      return result.rows[0];
    } catch (error) {
      if (!options.transaction) {
        await client.query('ROLLBACK');
      }
      logger.error('Erro ao criar pagamento no banco de dados:', {
        error: error.message,
        stack: error.stack,
        paymentData
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Atualiza o status de um pagamento
   * @param {string} paymentId - ID do pagamento
   * @param {string} status - Novo status
   * @param {string} statusDetail - Detalhes do status
   * @param {Object} metadata - Metadados adicionais (opcional)
   * @param {Object} options - Opções adicionais (transação, etc.)
   * @returns {Promise<Object>} Pagamento atualizado
   */
  async updateStatus(paymentId, status, statusDetail = null, metadata = {}, options = {}) {
    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      if (!options.transaction) {
        await client.query('BEGIN');
      }

      const result = await client.query(
        `UPDATE pagamentos 
        SET 
          status = $1, 
          status_detail = COALESCE($2, status_detail),
          metadata = COALESCE(metadata, '{}'::jsonb) || $3,
          updated_at = CURRENT_TIMESTAMP,
          paid_at = CASE WHEN $1 = 'approved' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
        WHERE id = $4 
        RETURNING *`,
        [status, statusDetail, metadata, paymentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Pagamento não encontrado');
      }

      if (!options.transaction) {
        await client.query('COMMIT');
      }

      return result.rows[0];
    } catch (error) {
      if (!options.transaction) {
        await client.query('ROLLBACK');
      }
      logger.error('Erro ao atualizar status do pagamento:', {
        error: error.message,
        stack: error.stack,
        paymentId,
        status,
        statusDetail,
        metadata
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Busca um pagamento pelo ID
   * @param {string} paymentId - ID do pagamento
   * @param {Object} options - Opções adicionais (transação, etc.)
   * @returns {Promise<Object>} Dados do pagamento
   */
  async findById(paymentId, options = {}) {
    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      const result = await client.query(
        'SELECT * FROM pagamentos WHERE id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao buscar pagamento por ID:', {
        error: error.message,
        stack: error.stack,
        paymentId
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Busca um pagamento pela referência externa
   * @param {string} externalReference - Referência externa
   * @param {Object} options - Opções adicionais (transação, etc.)
   * @returns {Promise<Object>} Dados do pagamento
   */
  async findByExternalReference(externalReference, options = {}) {
    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      const result = await client.query(
        'SELECT * FROM pagamentos WHERE external_reference = $1',
        [externalReference]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Erro ao buscar pagamento por referência externa:', {
        error: error.message,
        stack: error.stack,
        externalReference
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Lista pagamentos com base em filtros
   * @param {Object} filters - Filtros de busca
   * @param {Object} options - Opções de paginação e ordenação
   * @returns {Promise<Object>} Lista de pagamentos e metadados de paginação
   */
  async findByFilters(filters = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      order = [['created_at', 'DESC']]
    } = options;

    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      const offset = (page - 1) * limit;
      const queryParams = [];
      const whereClauses = [];
      let paramCount = 1;

      // Adiciona filtros à consulta
      if (filters.user_id) {
        whereClauses.push(`user_id = $${paramCount++}`);
        queryParams.push(filters.user_id);
      }

      if (filters.parking_id) {
        whereClauses.push(`parking_id = $${paramCount++}`);
        queryParams.push(filters.parking_id);
      }

      if (filters.status) {
        whereClauses.push(`status = $${paramCount++}`);
        queryParams.push(filters.status);
      }

      if (filters.payment_method) {
        whereClauses.push(`payment_method = $${paramCount++}`);
        queryParams.push(filters.payment_method);
      }

      if (filters.start_date) {
        whereClauses.push(`created_at >= $${paramCount++}`);
        queryParams.push(new Date(filters.start_date));
      }

      if (filters.end_date) {
        whereClauses.push(`created_at <= $${paramCount++}`);
        queryParams.push(new Date(filters.end_date));
      }

      if (filters.external_reference) {
        whereClauses.push(`external_reference = $${paramCount++}`);
        queryParams.push(filters.external_reference);
      }

      // Monta a cláusula WHERE
      const whereClause = whereClauses.length > 0 
        ? `WHERE ${whereClauses.join(' AND ')}` 
        : '';

      // Monta a cláusula ORDER BY
      let orderByClause = '';
      if (order && order.length > 0) {
        const orderParts = order.map(([field, direction]) => {
          const dir = direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
          return `${field} ${dir}`;
        });
        orderByClause = `ORDER BY ${orderParts.join(', ')}`;
      }

      // Consulta para obter os dados
      const result = await client.query(
        `SELECT * FROM pagamentos 
        ${whereClause}
        ${orderByClause}
        LIMIT $${paramCount++} OFFSET $${paramCount}`,
        [...queryParams, limit, offset]
      );

      // Consulta para contar o total de registros
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM pagamentos ${whereClause}`,
        queryParams
      );

      const total = parseInt(countResult.rows[0].total, 10);
      const totalPages = Math.ceil(total / limit);

      return {
        payments: result.rows,
        total,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      };
    } catch (error) {
      logger.error('Erro ao listar pagamentos com filtros:', {
        error: error.message,
        stack: error.stack,
        filters,
        options
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Lista pagamentos com paginação (método de compatibilidade)
   * @deprecated Use findByFilters em vez disso
   */
  async list(filters = {}, options = {}) {
    return this.findByFilters(filters, options);
  }

  /**
   * Verifica se um pagamento com o mesmo ID já existe
   * @param {string} paymentId - ID do pagamento
   * @param {Object} options - Opções adicionais (transação, etc.)
   * @returns {Promise<boolean>} True se o pagamento existir
   */
  async exists(paymentId, options = {}) {
    const client = options.transaction || (await getClient());
    const release = options.transaction ? () => {} : client.release;

    try {
      const result = await client.query(
        'SELECT 1 FROM pagamentos WHERE id = $1',
        [paymentId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Erro ao verificar existência do pagamento:', {
        error: error.message,
        stack: error.stack,
        paymentId
      });
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Gera um ID único para o pagamento
   * @returns {string} ID único
   */
  generateId() {
    return uuidv4();
  }

  /**
   * Inicializa a tabela de pagamentos (para testes e desenvolvimento)
   */
  async initTable() {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS pagamentos (
          id VARCHAR(255) PRIMARY KEY,
          external_reference VARCHAR(255) UNIQUE,
          user_id VARCHAR(255) NOT NULL,
          parking_id VARCHAR(255) NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          platform_amount DECIMAL(10, 2),
          parking_amount DECIMAL(10, 2),
          platform_fee DECIMAL(5, 2),
          payment_method VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL,
          status_detail VARCHAR(255),
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          paid_at TIMESTAMP WITH TIME ZONE
        );

        CREATE INDEX IF NOT EXISTS idx_pagamentos_user_id ON pagamentos(user_id);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_parking_id ON pagamentos(parking_id);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_created_at ON pagamentos(created_at);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_external_reference ON pagamentos(external_reference);
      `);
      
      logger.info('Tabela de pagamentos inicializada com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabela de pagamentos:', error);
      throw error;
    }
  }
}

module.exports = new PaymentModel();
