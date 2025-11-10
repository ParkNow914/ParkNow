-- ========================================
-- MIGRATION: Remover campos Stripe
-- Data: 2025-11-10
-- Descrição: Remove todas as colunas relacionadas ao Stripe
-- ========================================

-- 1. Remover colunas Stripe da tabela estacionamentos
ALTER TABLE estacionamentos 
    DROP COLUMN IF EXISTS stripe_account_id,
    DROP COLUMN IF EXISTS stripe_account_status,
    DROP COLUMN IF EXISTS stripe_charges_enabled,
    DROP COLUMN IF EXISTS stripe_payouts_enabled,
    DROP COLUMN IF EXISTS stripe_onboarded_at;

-- 2. Remover colunas Stripe da tabela pagamentos
ALTER TABLE pagamentos
    DROP COLUMN IF EXISTS stripe_payment_intent_id,
    DROP COLUMN IF EXISTS stripe_transfer_id,
    DROP COLUMN IF EXISTS stripe_client_secret;

-- 3. Remover índices relacionados ao Stripe (se existirem)
DROP INDEX IF EXISTS idx_estacionamentos_stripe_account_id;
DROP INDEX IF EXISTS idx_pagamentos_stripe_payment_intent_id;

-- ========================================
-- NOTAS:
-- - Mantemos: comissao_plataforma, valor_estacionamento (usado para split manual)
-- - Mantemos: chave_pix, tipo_chave_pix, nome_titular_pix (usado para PIX)
-- - Sistema volta 100% para Mercado Pago + PIX manual
-- ========================================
