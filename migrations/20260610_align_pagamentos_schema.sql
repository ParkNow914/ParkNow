-- Converge a tabela `pagamentos` entre as duas linhagens de schema existentes.
--
-- Histórico: bancos criados pelas migrations têm (data_criacao, data_atualizacao,
-- dados_adicionais, ...) enquanto o banco de produção (linhagem Sequelize antiga)
-- tem (created_at, updated_at, id_estacionamento, id_usuario, dados_retorno,
-- codigo_transacao, ...). O código usa colunas DAS DUAS linhagens — ou seja,
-- cada ambiente quebrava em pontos diferentes:
--   * confirmação manual (ORDER BY created_at / SET updated_at) quebrava em
--     bancos novos;
--   * pagamentoModel (ORDER BY data_criacao) quebrava em produção;
--   * INSERT com id_estacionamento/id_usuario/dados_retorno quebrava em bancos novos.
-- Esta migration garante que TODAS as colunas usadas pelo código existam em
-- qualquer linhagem, com backfill entre os pares equivalentes.

ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS data_criacao TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS data_atualizacao TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS id_estacionamento INTEGER REFERENCES estacionamentos(id) ON DELETE SET NULL;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS id_usuario INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS dados_retorno JSONB;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS codigo_transacao VARCHAR(255);

-- Backfill entre os pares equivalentes (em qualquer direção que falte)
UPDATE pagamentos
   SET created_at       = COALESCE(created_at, data_criacao, NOW()),
       updated_at       = COALESCE(updated_at, data_atualizacao, NOW()),
       data_criacao     = COALESCE(data_criacao, created_at, NOW()),
       data_atualizacao = COALESCE(data_atualizacao, updated_at, NOW());

ALTER TABLE pagamentos ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pagamentos ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pagamentos ALTER COLUMN data_criacao SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pagamentos ALTER COLUMN data_atualizacao SET DEFAULT CURRENT_TIMESTAMP;

-- Índices que faltavam (item do ROADMAP)
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva_id ON pagamentos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_reservas_usuario_status ON reservas(usuario_id, status);

-- Remove trigger de log irreparavelmente quebrado (criado em
-- 20240618_create_pagamentos_table.sql): referencia NEW.metodo (coluna
-- renomeada para metodo_pagamento em 20240627) e insere numa tabela `logs`
-- que não existe em nenhuma linhagem de schema. Com ele ativo, QUALQUER
-- INSERT em pagamentos falha em bancos criados pelas migrations.
DROP TRIGGER IF EXISTS trigger_log_alteracao_pagamento ON pagamentos;
DROP FUNCTION IF EXISTS log_alteracao_pagamento();
