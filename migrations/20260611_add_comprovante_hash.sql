-- Hash SHA-256 do arquivo de comprovante (anti-duplicação: detecta o mesmo
-- comprovante sendo reutilizado em pagamentos de reservas diferentes).
-- Item do ROADMAP: "Hash anti-duplicação de comprovante".

ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS comprovante_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_pagamentos_comprovante_hash
    ON pagamentos(comprovante_hash)
    WHERE comprovante_hash IS NOT NULL;
