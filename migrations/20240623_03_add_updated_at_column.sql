-- Adiciona apenas a coluna updated_at
ALTER TABLE vagas 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Adiciona comentário
COMMENT ON COLUMN vagas.updated_at IS 'Data e hora da ultima atualizacao do registro';
