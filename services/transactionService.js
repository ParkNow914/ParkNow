const { Pool } = require('pg');
const logger = require('../utils/logger');
const db = require('../models'); // Importa o Sequelize

class TransactionService {
  /**
   * Executa uma função dentro de uma transação
   * @param {Function} callback - Função que será executada dentro da transação
   * @param {Object} options - Opções adicionais
   * @param {boolean} [options.useSequelize=true] - Se deve usar o Sequelize para gerenciar a transação
   * @returns {Promise<*>} - Retorna o resultado da função callback
   */
  static async executeInTransaction(callback, { useSequelize = true } = {}) {
    if (useSequelize) {
      return this._executeWithSequelize(callback);
    } else {
      return this._executeWithPg(callback);
    }
  }

  /**
   * Executa uma função dentro de uma transação do Sequelize
   * @private
   */
  static async _executeWithSequelize(callback) {
    const transaction = await db.sequelize.transaction();
    
    try {
      logger.debug('Iniciando transação do Sequelize');
      const result = await callback(transaction);
      await transaction.commit();
      logger.debug('Transação do Sequelize confirmada com sucesso');
      return result;
    } catch (error) {
      logger.error('Erro na transação do Sequelize, realizando rollback', { error: error.message });
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Executa uma função dentro de uma transação do PostgreSQL puro
   * @private
   */
  static async _executeWithPg(callback) {
    const explicit = String(process.env.PG_SSL || '').toLowerCase();
    const sslOpt = explicit === 'false' || explicit === '0'
      ? false
      : explicit === 'true' || explicit === '1'
        ? { rejectUnauthorized: false }
        : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false);
    const pool = new Pool({
      user: process.env.PG_USER || 'postgres',
      host: process.env.PG_HOST || 'localhost',
      database: process.env.PG_DATABASE || 'parknow_db',
      password: process.env.PG_PASSWORD || '',
      port: parseInt(process.env.PG_PORT) || 5432,
      ssl: sslOpt,
    });

    const client = await pool.connect();
    
    try {
      logger.debug('Iniciando transação do PostgreSQL');
      await client.query('BEGIN');
      
      // Executa a função de callback passando o cliente
      const result = await callback(client);
      
      await client.query('COMMIT');
      logger.debug('Transação do PostgreSQL confirmada com sucesso');
      return result;
    } catch (error) {
      logger.error('Erro na transação do PostgreSQL, realizando rollback', { error: error.message });
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }

  /**
   * Cria uma transação aninhada (savepoint)
   * @param {Object} transaction - Transação pai
   * @param {string} savepointName - Nome do savepoint
   * @param {Function} callback - Função a ser executada dentro do savepoint
   * @returns {Promise<*>} - Retorna o resultado da função callback
   */
  static async withSavepoint(transaction, savepointName, callback) {
    if (!transaction || !transaction.sequelize) {
      throw new Error('Transação inválida fornecida');
    }

    try {
      await transaction.sequelize.query(`SAVEPOINT ${savepointName}`, { transaction });
      logger.debug(`Savepoint criado: ${savepointName}`);
      
      const result = await callback();
      return result;
    } catch (error) {
      logger.error(`Erro no savepoint ${savepointName}, realizando rollback`, { error: error.message });
      await transaction.sequelize.query(`ROLLBACK TO SAVEPOINT ${savepointName}`, { transaction });
      throw error;
    }
  }

  /**
   * Executa múltiplas operações em uma única transação
   * @param {Array<Function>} operations - Array de funções assíncronas que serão executadas em sequência
   * @returns {Promise<Array>} - Array com os resultados de cada operação
   */
  static async executeBatch(operations) {
    return this.executeInTransaction(async (transaction) => {
      const results = [];
      
      for (const [index, operation] of operations.entries()) {
        try {
          const result = await operation(transaction);
          results.push({ success: true, result });
        } catch (error) {
          logger.error(`Erro na operação ${index + 1}`, { error: error.message });
          results.push({ success: false, error });
          throw error; // Propaga o erro para fazer rollback de tudo
        }
      }
      
      return results;
    });
  }
}

module.exports = TransactionService;
