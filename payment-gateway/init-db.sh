#!/bin/bash
set -e

echo "Inicializando o banco de dados..."

# Cria o banco de dados se não existir
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Cria o banco de dados de teste se não existir
    SELECT 'CREATE DATABASE payment_gateway_test'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_gateway_test')\gexec
    
    -- Concede privilégios ao usuário postgres
    GRANT ALL PRIVILEGES ON DATABASE payment_gateway_test TO postgres;
    
    -- Cria extensões necessárias
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
    
    -- Cria a tabela de pagamentos se não existir
    \c payment_gateway_dev
    
    CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        payment_id VARCHAR(255) NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payer_email VARCHAR(255) NOT NULL,
        merchant_order_id VARCHAR(255),
        external_reference VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
    );
    
    -- Cria índices para melhorar a performance
    CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_payer_email ON payments(payer_email);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    
    -- Cria a mesma estrutura para o banco de teste
    \c payment_gateway_test
    
    CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        payment_id VARCHAR(255) NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payer_email VARCHAR(255) NOT NULL,
        merchant_order_id VARCHAR(255),
        external_reference VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
    );
    
    -- Cria índices para melhorar a performance
    CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_payer_email ON payments(payer_email);
    CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
    
    -- Concede privilégios
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
    GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;
EOSQL

echo "Banco de dados inicializado com sucesso!"
