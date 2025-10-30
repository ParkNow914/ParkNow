-- Adiciona colunas relacionadas a pagamento na tabela de reservas
ALTER TABLE reservas
ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_details JSONB,
ADD COLUMN IF NOT EXISTS valor_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS data_confirmacao_pagamento TIMESTAMP WITH TIME ZONE;

-- Cria índice para buscas por ID de pagamento
CREATE INDEX IF NOT EXISTS idx_reservas_payment_id ON reservas(payment_id);

-- Atualiza o status das reservas existentes
UPDATE reservas 
SET payment_status = 'paid', 
    payment_method = 'manual',
    payment_details = '{"method": "manual", "processed_by": "system"}'::jsonb,
    valor_pago = valor_total,
    data_pagamento = created_at,
    data_confirmacao_pagamento = created_at
WHERE status = 'confirmada' AND payment_status IS NULL;

-- Atualiza o status das reservas canceladas
UPDATE reservas 
SET payment_status = 'refunded'
WHERE status = 'cancelada' AND payment_status IS NULL AND valor_pago > 0;
