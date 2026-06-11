-- Tabela de contadores de rate limiting persistidos (utils/pgRateLimitStore.js).
-- Antes os contadores viviam em memória: caíam junto com o processo (um restart
-- zerava o brute-force budget) e não funcionavam com mais de uma instância.

CREATE TABLE IF NOT EXISTS rate_limits (
    key        TEXT PRIMARY KEY,
    hits       INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
