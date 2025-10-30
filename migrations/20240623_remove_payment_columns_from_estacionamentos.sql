-- Remove payment gateway related columns from estacionamentos table
ALTER TABLE estacionamentos
DROP COLUMN IF EXISTS aceita_cartao_credito,
DROP COLUMN IF EXISTS aceita_cartao_debito,
DROP COLUMN IF EXISTS id_mercado_pago,
DROP COLUMN IF EXISTS access_token_mp,
DROP COLUMN IF EXISTS refresh_token_mp,
DROP COLUMN IF EXISTS token_expires_at,
DROP COLUMN IF EXISTS public_key_mp;
