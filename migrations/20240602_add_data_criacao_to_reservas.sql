-- Adiciona a coluna data_criacao à tabela reservas
ALTER TABLE reservas 
ADD COLUMN data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Se a coluna created_at existir, copia os valores para data_criacao
UPDATE reservas 
SET data_criacao = created_at 
WHERE data_criacao IS NULL AND created_at IS NOT NULL;

-- Se ainda houver valores nulos, define a data atual
UPDATE reservas 
SET data_criacao = CURRENT_TIMESTAMP 
WHERE data_criacao IS NULL;
