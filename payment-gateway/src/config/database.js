const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('./');

// Configuração do pool de conexões
const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl,
  max: config.database.pool.max || 20,
  min: config.database.pool.min || 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000, // 10 segundos
  query_timeout: 20000,     // 20 segundos
  application_name: 'payment-gateway-api',
});

// Captura eventos de erro do pool
pool.on('error', (err) => {
  logger.error('Erro inesperado no pool de conexões:', err);
  // Aqui você pode adicionar lógica de reconexão ou notificação
});

// Captura eventos de conexão
pool.on('connect', (client) => {
  // Configura o cliente para usar o timezone UTC
  client.query('SET TIME ZONE UTC');
  
  // Configura o formato de data para ISO
  client.query("SET DATESTYLE TO 'ISO, YMD'");
  
  // Configura o nível de isolamento da transação
  client.query('SET default_transaction_isolation = \'read committed\'');
});

/**
 * Testa a conexão com o banco de dados
 * @returns {Promise<boolean>} Retorna true se a conexão for bem-sucedida
 */
const testConnection = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as now');
    logger.info('Conexão com o banco de dados estabelecida com sucesso', { 
      timestamp: result.rows[0].now,
      serverVersion: client.client.serverVersion,
      database: client.client.database,
      user: client.client.user,
      host: client.client.host,
      port: client.client.port,
    });
    return true;
  } catch (error) {
    logger.error('Erro ao conectar ao banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Executa uma query no banco de dados com suporte a transações
 * @param {string} text - Query SQL
 * @param {Array} params - Parâmetros da query
 * @param {Object} client - Cliente de conexão opcional (para transações)
 * @returns {Promise<Object>} Resultado da query
 */
const query = async (text, params = [], client = null) => {
  const start = Date.now();
  const queryId = uuidv4();
  
  // Usa o cliente fornecido ou obtém um novo do pool
  const queryClient = client || pool;
  
  try {
    logger.debug('Executando query', { 
      queryId, 
      query: text.trim().split('\n').map(s => s.trim()).join(' '),
      params: params.length > 0 ? params : undefined,
    });
    
    const res = await queryClient.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Query executada com sucesso', { 
      queryId, 
      duration: `${duration}ms`,
      rowCount: res.rowCount,
    });
    
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Erro na query', { 
      queryId, 
      error: error.message, 
      query: text.trim().split('\n').map(s => s.trim()).join(' '),
      params: params.length > 0 ? params : undefined,
      duration: `${duration}ms`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    
    // Adiciona informações adicionais ao erro
    error.query = text;
    error.params = params;
    error.code = error.code || 'QUERY_ERROR';
    
    throw error;
  }
};

/**
 * Inicia uma transação
 * @returns {Promise<Object>} Cliente de conexão com a transação iniciada
 */
const beginTransaction = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    logger.debug('Transação iniciada', { transactionId: uuidv4() });
    return client;
  } catch (error) {
    client.release();
    logger.error('Erro ao iniciar transação:', error);
    throw error;
  }
};

/**
 * Faz commit de uma transação
 * @param {Object} client - Cliente de conexão com a transação ativa
 * @returns {Promise<void>}
 */
const commitTransaction = async (client) => {
  try {
    await client.query('COMMIT');
    logger.debug('Transação confirmada');
  } catch (error) {
    logger.error('Erro ao confirmar transação:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Faz rollback de uma transação
 * @param {Object} client - Cliente de conexão com a transação ativa
 * @returns {Promise<void>}
 */
const rollbackTransaction = async (client) => {
  try {
    await client.query('ROLLBACK');
    logger.warn('Transação revertida');
  } catch (error) {
    logger.error('Erro ao reverter transação:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Inicializa o banco de dados e cria as tabelas necessárias
 * @returns {Promise<void>}
 */
const initDatabase = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Cria a tabela de configurações se não existir
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    // Cria a tabela de pagamentos com suporte a split
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id VARCHAR(255) NOT NULL,
        external_reference VARCHAR(255) UNIQUE,
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
        status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payment_method_id VARCHAR(100),
        installments INTEGER,
        payment_type_id VARCHAR(50),
        platform_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
        platform_amount DECIMAL(12, 2) NOT NULL,
        parking_amount DECIMAL(12, 2) NOT NULL,
        parking_id VARCHAR(100) NOT NULL,
        parking_receiver_id VARCHAR(100) NOT NULL,
        
        -- Dados do pagador
        payer_id VARCHAR(100),
        payer_email VARCHAR(255) NOT NULL,
        payer_first_name VARCHAR(100),
        payer_last_name VARCHAR(100),
        payer_identification_type VARCHAR(20),
        payer_identification_number VARCHAR(50),
        
        -- Dados de faturamento
        billing_address_street_name VARCHAR(255),
        billing_address_street_number VARCHAR(20),
        billing_address_zip_code VARCHAR(20),
        billing_address_city VARCHAR(100),
        billing_address_state VARCHAR(100),
        billing_address_country VARCHAR(100),
        
        -- Metadados e auditoria
        metadata JSONB,
        notification_url TEXT,
        callback_url TEXT,
        statement_descriptor VARCHAR(300),
        date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        date_approved TIMESTAMPTZ,
        date_last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        date_of_expiration TIMESTAMPTZ,
        
        -- Dados do cartão (se aplicável)
        card_id VARCHAR(100),
        card_first_six_digits VARCHAR(6),
        card_last_four_digits VARCHAR(4),
        card_expiration_month INTEGER,
        card_expiration_year INTEGER,
        card_holder_name VARCHAR(100),
        card_issuer_id VARCHAR(100),
        
        -- Dados do PIX (se aplicável)
        pix_qr_code TEXT,
        pix_qr_code_base64 TEXT,
        pix_ticket_url TEXT,
        pix_barcode TEXT,
        pix_transaction_amount DECIMAL(12, 2),
        
        -- Controle de concorrência otimista
        version INTEGER NOT NULL DEFAULT 1,
        
        -- Índices
        CONSTRAINT chk_payment_status CHECK (status IN (
          'pending', 'approved', 'authorized', 'in_process', 'in_mediation',
          'rejected', 'cancelled', 'refunded', 'charged_back', 'in_refund'
        )),
        CONSTRAINT chk_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_platform_fee_non_negative CHECK (platform_fee >= 0),
        CONSTRAINT chk_platform_amount_non_negative CHECK (platform_amount >= 0),
        CONSTRAINT chk_parking_amount_non_negative CHECK (parking_amount >= 0),
        CONSTRAINT chk_amount_sum CHECK (platform_amount + parking_amount <= amount)
      );
    `);
    
    // Cria índices para melhorar a performance das consultas
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(external_id);
      CREATE INDEX IF NOT EXISTS idx_payments_external_reference ON payments(external_reference);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_payer_email ON payments(payer_email);
      CREATE INDEX IF NOT EXISTS idx_payments_parking_id ON payments(parking_id);
      CREATE INDEX IF NOT EXISTS idx_payments_date_created ON payments(date_created);
      CREATE INDEX IF NOT EXISTS idx_payments_date_last_updated ON payments(date_last_updated);
      
      -- Índice para consultas por intervalo de datas
      CREATE INDEX IF NOT EXISTS idx_payments_date_range ON payments USING btree (date_created);
      
      -- Índice para consultas por status e data
      CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, date_created DESC);
      
      -- Índice para consultas por pagador
      CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_email, date_created DESC);
    `);
    
    // Cria a tabela de webhooks para rastrear notificações
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
        external_id VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        request_headers JSONB,
        request_body JSONB,
        response_status INTEGER,
        response_body JSONB,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT fk_webhook_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_webhooks_payment_id ON payment_webhooks(payment_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_external_id ON payment_webhooks(external_id);
      CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON payment_webhooks(created_at);
    `);
    
    // Cria a tabela de logs de auditoria
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        changed_by VARCHAR(100),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT fk_audit_log_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_audit_logs_payment_id ON payment_audit_logs(payment_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON payment_audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON payment_audit_logs(created_at);
    `);
    
    // Cria a tabela de reembolsos
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        external_id VARCHAR(255) NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        reason TEXT,
        metadata JSONB,
        created_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        CONSTRAINT chk_refund_status CHECK (status IN (
          'pending', 'approved', 'rejected', 'cancelled', 'refunded'
        )),
        CONSTRAINT chk_refund_amount_positive CHECK (amount > 0)
      );
      
      CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
      CREATE INDEX IF NOT EXISTS idx_payment_refunds_external_id ON payment_refunds(external_id);
      CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
    `);
    
    // Cria a função para atualizar o campo updated_at automaticamente
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Cria os triggers para atualizar o campo updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
      CREATE TRIGGER update_payments_updated_at
      BEFORE UPDATE ON payments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
      
      DROP TRIGGER IF EXISTS update_payment_webhooks_updated_at ON payment_webhooks;
      CREATE TRIGGER update_payment_webhooks_updated_at
      BEFORE UPDATE ON payment_webhooks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
      
      DROP TRIGGER IF EXISTS update_payment_refunds_updated_at ON payment_refunds;
      CREATE TRIGGER update_payment_refunds_updated_at
      BEFORE UPDATE ON payment_refunds
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    
    await client.query('COMMIT');
    logger.info('Banco de dados inicializado com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro ao inicializar o banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fecha a conexão com o banco de dados
 * @returns {Promise<void>}
 */
const close = async () => {
  try {
    await pool.end();
    logger.info('Conexão com o banco de dados encerrada');
  } catch (error) {
    logger.error('Erro ao encerrar a conexão com o banco de dados:', error);
    throw error;
  }
};

/**
 * Executa uma função dentro de uma transação
 * @param {Function} callback - Função a ser executada dentro da transação
 * @returns {Promise<*>} Retorna o resultado da função de callback
 */
const withTransaction = async (callback) => {
  const client = await beginTransaction();
  
  try {
    const result = await callback(client);
    await commitTransaction(client);
    return result;
  } catch (error) {
    await rollbackTransaction(client);
    throw error;
  }
};

module.exports = {
  // Gerenciamento de conexão
  pool,
  query,
  testConnection,
  initDatabase,
  close,
  
  // Gerenciamento de transações
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  withTransaction,
  
  // Utilitários
  raw: (sql, values) => {
    // Função auxiliar para criar SQL bruto com valores escapados
    // Útil para consultas complexas que não são suportadas pelo query builder
    return {
      text: sql,
      values: values || [],
    };
  },
};
