-- Adiciona a coluna chave_pix à tabela estacionamentos
-- Esta migração é necessária para permitir que os donos de estacionamento
-- recebam pagamentos via PIX diretamente em suas contas.

-- Adiciona a coluna chave_pix
ALTER TABLE estacionamentos 
ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(255),
ADD COLUMN IF NOT EXISTS tipo_chave_pix VARCHAR(20),
ADD COLUMN IF NOT EXISTS nome_titular_pix VARCHAR(100);

-- Adiciona comentários para documentação
COMMENT ON COLUMN estacionamentos.chave_pix IS 'Chave PIX do estacionamento (CPF, CNPJ, telefone, e-mail ou chave aleatória)';
COMMENT ON COLUMN estacionamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, telefone, email, aleatoria)';
COMMENT ON COLUMN estacionamentos.nome_titular_pix IS 'Nome do titular da conta PIX';

-- Cria um índice para melhorar a performance de buscas por chave PIX
CREATE INDEX IF NOT EXISTS idx_estacionamentos_chave_pix ON estacionamentos(chave_pix) WHERE chave_pix IS NOT NULL;

-- Atualiza a view ou lógica de negócio que depende da tabela estacionamentos
-- (se necessário, adicione aqui comandos para atualizar views ou funções existentes)

-- Exemplo de atualização para estacionamentos existentes (opcional)
-- UPDATE estacionamentos 
-- SET chave_pix = cnpj, 
--     tipo_chave_pix = 'cnpj',
--     nome_titular_pix = nome
-- WHERE cnpj IS NOT NULL;
