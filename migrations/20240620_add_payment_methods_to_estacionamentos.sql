-- Adiciona colunas para métodos de pagamento e integração com Mercado Pago
ALTER TABLE estacionamentos
ADD COLUMN IF NOT EXISTS aceita_cartao_credito BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aceita_cartao_debito BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS id_mercado_pago VARCHAR(100),
ADD COLUMN IF NOT EXISTS access_token_mp VARCHAR(500),
ADD COLUMN IF NOT EXISTS refresh_token_mp VARCHAR(500),
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS public_key_mp VARCHAR(100);

-- Comentários para documentação
COMMENT ON COLUMN estacionamentos.aceita_cartao_credito IS 'Indica se o estacionamento aceita cartão de crédito';
COMMENT ON COLUMN estacionamentos.aceita_cartao_debito IS 'Indica se o estacionamento aceita cartão de débito';
COMMENT ON COLUMN estacionamentos.id_mercado_pago IS 'ID da conta do Mercado Pago';
COMMENT ON COLUMN estacionamentos.public_key_mp IS 'Chave pública do Mercado Pago para pagamentos no frontend';

-- Cria tabela para armazenar transações de pagamento
CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL REFERENCES estacionamentos(id) ON DELETE CASCADE,
    reserva_id INTEGER REFERENCES reservas(id) ON DELETE SET NULL,
    valor DECIMAL(10, 2) NOT NULL,
    metodo_pagamento VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    codigo_pagamento VARCHAR(100),
    qr_code TEXT,
    qr_code_base64 TEXT,
    link_pagamento TEXT,
    dados_pagamento JSONB,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_confirmacao TIMESTAMP WITH TIME ZONE
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_pagamentos_estacionamento_id ON pagamentos(estacionamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva_id ON pagamentos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);

-- Trigger para atualizar data_atualizacao
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pagamentos_modtime
BEFORE UPDATE ON pagamentos
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
