-- Criação da tabela de pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    reserva_id INTEGER NOT NULL,
    metodo VARCHAR(20) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    dados_adicionais JSONB,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_pagamento TIMESTAMP WITH TIME ZONE,
    data_vencimento TIMESTAMP WITH TIME ZONE,
    codigo_barras VARCHAR(54),
    codigo_pix TEXT,
    qr_code TEXT,
    
    -- Chave estrangeira para a tabela de reservas
    CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
    
    -- Restrições
    CONSTRAINT check_metodo_valido CHECK (
        metodo IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro')
    ),
    
    CONSTRAINT check_status_valido CHECK (
        status IN ('pendente', 'aprovado', 'recusado', 'reembolsado', 'estornado', 'cancelado')
    ),
    
    CONSTRAINT check_valor_positivo CHECK (
        valor > 0
    )
);

-- Índices para melhorar desempenho de consultas comuns
CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva_id ON pagamentos(reserva_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_data_criacao ON pagamentos(data_criacao);

-- Comentários para documentação
COMMENT ON TABLE pagamentos IS 'Armazena informações sobre pagamentos de reservas de estacionamento';
COMMENT ON COLUMN pagamentos.reserva_id IS 'ID da reserva associada ao pagamento';
COMMENT ON COLUMN pagamentos.metodo IS 'Método de pagamento utilizado (pix, cartao_credito, cartao_debito, boleto, dinheiro)';
COMMENT ON COLUMN pagamentos.valor IS 'Valor do pagamento';
COMMENT ON COLUMN pagamentos.status IS 'Status atual do pagamento (pendente, aprovado, recusado, etc)';
COMMENT ON COLUMN pagamentos.dados_adicionais IS 'Dados adicionais do pagamento em formato JSON';
COMMENT ON COLUMN pagamentos.data_criacao IS 'Data e hora de criação do registro';
COMMENT ON COLUMN pagamentos.data_atualizacao IS 'Data e hora da última atualização do registro';
COMMENT ON COLUMN pagamentos.data_pagamento IS 'Data e hora em que o pagamento foi confirmado';
COMMENT ON COLUMN pagamentos.data_vencimento IS 'Data de vencimento do pagamento (para boletos)';
COMMENT ON COLUMN pagamentos.codigo_barras IS 'Código de barras (para boletos)';
COMMENT ON COLUMN pagamentos.codigo_pix IS 'Código PIX copia e cola';
COMMENT ON COLUMN pagamentos.qr_code IS 'Código QR Code para pagamento (PIX ou boleto)';

-- Trigger para atualizar automaticamente a data de atualização
CREATE OR REPLACE FUNCTION atualizar_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_data_atualizacao
BEFORE UPDATE ON pagamentos
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_atualizacao();

-- (Removido) O trigger de log de alterações referenciava NEW.metodo (coluna
-- renomeada para metodo_pagamento) e uma tabela `logs` inexistente — quebrava
-- qualquer INSERT em pagamentos. Ver 20260610_align_pagamentos_schema.sql.
