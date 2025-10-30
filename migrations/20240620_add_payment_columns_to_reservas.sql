-- Adiciona colunas para suportar pagamentos nas reservas
ALTER TABLE reservas
ADD COLUMN IF NOT EXISTS id_pagamento VARCHAR(255),
ADD COLUMN IF NOT EXISTS status_pagamento VARCHAR(50) DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS metodo_pagamento VARCHAR(50),
ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP,
ADD COLUMN IF NOT EXISTS dados_pagamento JSONB;

-- Cria índice para melhorar consultas por ID de pagamento
CREATE INDEX IF NOT EXISTS idx_reservas_id_pagamento ON reservas(id_pagamento);

-- Cria tabela para armazenar as configurações de pagamento dos estacionamentos
CREATE TABLE IF NOT EXISTS estacionamento_pagamentos (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL REFERENCES estacionamentos(id) ON DELETE CASCADE,
    tipo_chave_pix VARCHAR(20) NOT NULL,
    chave_pix VARCHAR(255) NOT NULL,
    nome_titular VARCHAR(255) NOT NULL,
    banco VARCHAR(100),
    tipo_conta VARCHAR(20) DEFAULT 'CONTA_CORRENTE',
    agencia VARCHAR(20),
    conta VARCHAR(50),
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
    data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(estacionamento_id)
);

-- Cria trigger para atualizar a data de atualização automaticamente
CREATE OR REPLACE FUNCTION update_estacionamento_pagamentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_estacionamento_pagamentos_updated_at
BEFORE UPDATE ON estacionamento_pagamentos
FOR EACH ROW
EXECUTE FUNCTION update_estacionamento_pagamentos_updated_at();

-- Atualiza a versão do banco de dados
INSERT INTO migrations (nome, aplicada_em) 
VALUES ('20240620_add_payment_columns_to_reservas', NOW())
ON CONFLICT (nome) DO NOTHING;
