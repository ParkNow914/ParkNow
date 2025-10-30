-- Remove payment-related columns from reservas table
ALTER TABLE reservas
DROP COLUMN IF EXISTS payment_id,
DROP COLUMN IF EXISTS payment_method,
DROP COLUMN IF EXISTS payment_status,
DROP COLUMN IF EXISTS payment_details,
DROP COLUMN IF EXISTS valor_pago,
DROP COLUMN IF EXISTS data_pagamento,
DROP COLUMN IF EXISTS data_confirmacao_pagamento;

-- Note: We're keeping valor_total as it might be used for other purposes
-- ALTER TABLE reservas DROP COLUMN IF EXISTS valor_total;
