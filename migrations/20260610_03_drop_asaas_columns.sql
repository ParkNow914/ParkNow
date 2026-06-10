-- Remove as colunas mortas do gateway ASAAS (removido na v2.0 always-free).
-- Nenhum código referencia mais estas colunas (verificado por grep; o último
-- SELECT em estacionamentoModel.findById foi limpo junto desta migration).
-- Item do ROADMAP: "Dropar colunas mortas (asaas_*, stripe_*)".

ALTER TABLE estacionamentos DROP COLUMN IF EXISTS asaas_wallet_id;
ALTER TABLE estacionamentos DROP COLUMN IF EXISTS asaas_connected_at;
ALTER TABLE estacionamentos DROP COLUMN IF EXISTS asaas_customer_id;
