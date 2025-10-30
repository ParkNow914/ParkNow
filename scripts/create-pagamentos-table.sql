-- Criação da tabela de pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL,
    reserva_id INTEGER,
    valor DECIMAL(10, 2) NOT NULL,
    metodo_pagamento VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    codigo_pagamento VARCHAR(100) NOT NULL UNIQUE,
    qr_code TEXT,
    qr_code_base64 TEXT,
    codigo_pix TEXT,
    link_pagamento TEXT,
    dados_pagamento JSONB,
    data_expiracao TIMESTAMP WITH TIME ZONE,
    data_aprovacao TIMESTAMP WITH TIME ZONE,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Chaves estrangeiras
    CONSTRAINT fk_estacionamento FOREIGN KEY (estacionamento_id) 
        REFERENCES estacionamentos(id) ON DELETE CASCADE,
    CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) 
        REFERENCES reservas(id) ON DELETE SET NULL,
    
    -- Restrições de domínio
    CONSTRAINT check_metodo_pagamento 
        CHECK (metodo_pagamento IN ('pix', 'credit_card', 'debit_card', 'boleto')),
    CONSTRAINT check_status 
        CHECK (status IN (
            'pending', 'approved', 'authorized', 'in_process', 
            'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back'
        ))
);

-- Índices para melhorar o desempenho
CREATE INDEX IF NOT EXISTS idx_pagamentos_estacionamento_id ON pagamentos(estacionamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva_id ON pagamentos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_codigo_pagamento ON pagamentos(codigo_pagamento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data_criacao ON pagamentos(data_criacao);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data_expiracao ON pagamentos(data_expiracao);

-- Comentários para documentação
COMMENT ON TABLE pagamentos IS 'Armazena informações sobre pagamentos realizados no sistema';
COMMENT ON COLUMN pagamentos.estacionamento_id IS 'ID do estacionamento associado ao pagamento';
COMMENT ON COLUMN pagamentos.reserva_id IS 'ID da reserva associada ao pagamento (opcional)';
COMMENT ON COLUMN pagamentos.valor IS 'Valor total do pagamento';
COMMENT ON COLUMN pagamentos.metodo_pagamento IS 'Método de pagamento utilizado (pix, credit_card, debit_card, boleto)';
COMMENT ON COLUMN pagamentos.status IS 'Status atual do pagamento';
COMMENT ON COLUMN pagamentos.codigo_pagamento IS 'Código único do pagamento no gateway';
COMMENT ON COLUMN pagamentos.qr_code IS 'QR Code para pagamento PIX';
COMMENT ON COLUMN pagamentos.qr_code_base64 IS 'QR Code em base64 para exibição no frontend';
COMMENT ON COLUMN pagamentos.codigo_pix IS 'Código PIX copia e cola';
COMMENT ON COLUMN pagamentos.link_pagamento IS 'Link para a página de pagamento';
COMMENT ON COLUMN pagamentos.dados_pagamento IS 'Dados completos do pagamento retornados pelo gateway';
COMMENT ON COLUMN pagamentos.data_expiracao IS 'Data de expiração do pagamento';
COMMENT ON COLUMN pagamentos.data_aprovacao IS 'Data de aprovação do pagamento';
COMMENT ON COLUMN pagamentos.data_criacao IS 'Data de criação do registro';
COMMENT ON COLUMN pagamentos.data_atualizacao IS 'Data da última atualização do registro';
