-- Always-free PIX manual: campos para fluxo de comprovante + confirmação por admin.
--
-- Reuso da tabela `pagamentos` (não criamos tabela nova).
--
-- Campos adicionados:
--   comprovante_url           : caminho do arquivo enviado pelo usuário (foto/PDF do PIX pago).
--   comprovante_enviado_em    : timestamp do upload (cliente avisou que pagou).
--   confirmado_em             : timestamp em que o admin marcou como aprovado.
--   confirmado_por_admin_id   : qual admin confirmou (auditoria).
--   rejeitado_em              : timestamp em que o admin rejeitou (sem comprovante / valor errado).
--   motivo_rejeicao           : texto livre (admin descreve o motivo).

BEGIN;

ALTER TABLE pagamentos
    ADD COLUMN IF NOT EXISTS comprovante_url          VARCHAR(500),
    ADD COLUMN IF NOT EXISTS comprovante_enviado_em   TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS confirmado_em            TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS confirmado_por_admin_id  INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejeitado_em             TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS motivo_rejeicao          TEXT;

COMMENT ON COLUMN pagamentos.comprovante_url IS
    'Caminho do comprovante PIX (imagem/PDF) enviado pelo usuário para confirmação manual.';
COMMENT ON COLUMN pagamentos.confirmado_em IS
    'Quando o admin confirmou manualmente o pagamento. NULL = ainda pendente.';
COMMENT ON COLUMN pagamentos.confirmado_por_admin_id IS
    'ID do admin que aprovou o pagamento (auditoria).';
COMMENT ON COLUMN pagamentos.rejeitado_em IS
    'Quando o admin rejeitou o pagamento (comprovante inválido / valor errado).';

-- Índice parcial: acelera o "fila de pendentes" do painel admin.
CREATE INDEX IF NOT EXISTS idx_pagamentos_aguardando_confirmacao
    ON pagamentos (comprovante_enviado_em)
 WHERE confirmado_em IS NULL
   AND rejeitado_em  IS NULL
   AND comprovante_url IS NOT NULL;

COMMIT;
