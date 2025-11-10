-- ============================================
-- Migration: Adicionar telefone e CNPJ para admins
-- Data: 2025-11-10
-- Descrição: Adiciona campos de contato para uso no Asaas
-- ============================================

-- Adicionar campos de contato ao admin
ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS telefone VARCHAR(15),
ADD COLUMN IF NOT EXISTS cnpj VARCHAR(18);

-- Adicionar índice para CNPJ
CREATE INDEX IF NOT EXISTS idx_admins_cnpj ON admins(cnpj);

-- Comentários nas colunas
COMMENT ON COLUMN admins.telefone IS 'Telefone de contato do administrador';
COMMENT ON COLUMN admins.cnpj IS 'CNPJ do estacionamento (cadastrado pelo admin)';

-- Log da migração
DO $$
BEGIN
    RAISE NOTICE 'Migration 20251110: Telefone e CNPJ adicionados aos admins com sucesso!';
END $$;
