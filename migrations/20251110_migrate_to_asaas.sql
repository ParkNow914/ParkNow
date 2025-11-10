-- =====================================
-- Migração para Asaas (Limpar MP e Stripe)
-- Data: 2025-11-10
-- =====================================

-- 1. Adicionar colunas do Asaas em estacionamentos
ALTER TABLE estacionamentos
ADD COLUMN IF NOT EXISTS asaas_wallet_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS asaas_connected_at TIMESTAMP WITH TIME ZONE;

-- 2. Remover colunas do Mercado Pago
ALTER TABLE estacionamentos
DROP COLUMN IF EXISTS mp_account_id,
DROP COLUMN IF EXISTS mp_access_token,
DROP COLUMN IF EXISTS mp_public_key,
DROP COLUMN IF EXISTS mp_refresh_token,
DROP COLUMN IF EXISTS mp_connected_at;

-- 3. Remover colunas do Stripe
ALTER TABLE estacionamentos
DROP COLUMN IF EXISTS stripe_account_id,
DROP COLUMN IF EXISTS stripe_connected,
DROP COLUMN IF EXISTS stripe_details_submitted,
DROP COLUMN IF EXISTS stripe_charges_enabled,
DROP COLUMN IF EXISTS stripe_payouts_enabled,
DROP COLUMN IF EXISTS stripe_onboarding_url,
DROP COLUMN IF EXISTS stripe_connected_at;

-- 4. Adicionar índice para Asaas
CREATE INDEX IF NOT EXISTS idx_estacionamentos_asaas_wallet 
ON estacionamentos(asaas_wallet_id);

-- 5. Comentários
COMMENT ON COLUMN estacionamentos.asaas_wallet_id IS 'ID da carteira/subconta no Asaas para split de pagamentos';
COMMENT ON COLUMN estacionamentos.asaas_connected_at IS 'Data de conexão com o Asaas';

-- =====================================
-- Log da migração
-- =====================================
SELECT 'Migração para Asaas concluída!' AS resultado;
