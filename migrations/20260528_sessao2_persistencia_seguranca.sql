-- Sessão 2 — Persistência & Segurança
--
-- 1) parceria_solicitacoes : substitui o tempStorage em memória (aprovações de
--    parceria não se perdem mais em restart do servidor).
-- 2) idempotency_keys       : persiste o middleware de idempotência (funciona
--    com múltiplas instâncias e sobrevive a restart).
-- 3) colunas de verificação de email em usuarios (ativa o fluxo de confirmação).

BEGIN;

-- ─── 1) Aprovações de parceria ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parceria_solicitacoes (
    chave        VARCHAR(255) PRIMARY KEY,
    dados        JSONB        NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parceria_expires ON parceria_solicitacoes (expires_at);
COMMENT ON TABLE parceria_solicitacoes IS
    'Solicitações de parceria pendentes de aprovação (antes ficavam só em memória).';

-- ─── 2) Idempotency keys ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key          VARCHAR(255) PRIMARY KEY,
    fingerprint  VARCHAR(128),
    status       VARCHAR(20)  NOT NULL DEFAULT 'in_progress',
    status_code  INTEGER,
    body         JSONB,
    expires_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);
COMMENT ON TABLE idempotency_keys IS
    'Cache de respostas idempotentes (Idempotency-Key). Persistente e multi-instância.';

-- ─── 3) Verificação de email ─────────────────────────────────────────────
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS email_verification_token   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_usuarios_email_verif_token
    ON usuarios (email_verification_token)
    WHERE email_verification_token IS NOT NULL;

COMMENT ON COLUMN usuarios.email_verification_token IS
    'Token (hash) para confirmação de email no cadastro.';
COMMENT ON COLUMN usuarios.email_verified_at IS
    'Quando o email foi confirmado. NULL = ainda não verificado.';

COMMIT;
