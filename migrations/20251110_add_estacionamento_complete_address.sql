-- ============================================
-- Migration: Adicionar campos completos de endereço
-- Data: 2025-11-10
-- Descrição: Adiciona campos detalhados de endereço para uso no Asaas
-- ============================================

-- Adicionar campos de endereço ao estacionamento
ALTER TABLE estacionamentos 
ADD COLUMN IF NOT EXISTS cep VARCHAR(9),
ADD COLUMN IF NOT EXISTS logradouro VARCHAR(255),
ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
ADD COLUMN IF NOT EXISTS uf CHAR(2),
ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS asaas_customer_id VARCHAR(255);

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_estacionamentos_cnpj ON estacionamentos(cnpj);
CREATE INDEX IF NOT EXISTS idx_estacionamentos_asaas_wallet ON estacionamentos(asaas_wallet_id);

-- Comentários nas colunas
COMMENT ON COLUMN estacionamentos.cep IS 'CEP do estacionamento (formato: 00000-000)';
COMMENT ON COLUMN estacionamentos.logradouro IS 'Logradouro (Rua, Avenida, etc)';
COMMENT ON COLUMN estacionamentos.numero IS 'Número do endereço';
COMMENT ON COLUMN estacionamentos.complemento IS 'Complemento do endereço (opcional)';
COMMENT ON COLUMN estacionamentos.bairro IS 'Bairro';
COMMENT ON COLUMN estacionamentos.cidade IS 'Cidade';
COMMENT ON COLUMN estacionamentos.uf IS 'Unidade Federativa (Estado)';
COMMENT ON COLUMN estacionamentos.asaas_wallet_id IS 'ID da subconta (wallet) no Asaas para receber splits';
COMMENT ON COLUMN estacionamentos.asaas_customer_id IS 'ID do customer do estacionamento no Asaas';

-- Log da migração
DO $$
BEGIN
    RAISE NOTICE 'Migration 20251110: Campos de endereço completo adicionados com sucesso!';
END $$;
