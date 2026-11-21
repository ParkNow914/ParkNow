-- Fase 0 da auditoria de 2026-11-20 (AUDITORIA_2026-11-20.md).

-- C-08: o login de admin grava o hash do refresh token nesta coluna, que só
-- existia em scripts/migrations/ (pasta que o runner não executa).
ALTER TABLE admins ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;

-- Valor e período das reservas/pagamentos são validados no código
-- (utils/pricing.js, services/reservaService.js). Travas CHECK ficam para uma
-- migration posterior de limpeza: em produção já existem pagamentos com
-- valor NaN, e um CHECK (mesmo NOT VALID) faria o job de expiração falhar ao
-- cancelar essas linhas antigas.

-- Índices usados pelas consultas com escopo de estacionamento (C-05) e pela
-- checagem de conflito de vaga (C-03).
CREATE INDEX IF NOT EXISTS idx_estacionamentos_admin_id ON estacionamentos (admin_id);
CREATE INDEX IF NOT EXISTS idx_reservas_vaga_periodo ON reservas (vaga_id, data_entrada_prevista, data_saida_prevista);
CREATE INDEX IF NOT EXISTS idx_pagamentos_id_usuario ON pagamentos (id_usuario);
CREATE INDEX IF NOT EXISTS idx_pagamentos_id_estacionamento ON pagamentos (id_estacionamento);
