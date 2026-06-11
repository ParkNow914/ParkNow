-- reservas.id_pagamento existia na linhagem de produção e é gravada por
-- reservaService.criarReservaComPagamento — mas nunca teve migration, então
-- bancos novos quebravam ao criar reserva com pagamento.

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS id_pagamento INTEGER REFERENCES pagamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_id_pagamento
    ON reservas(id_pagamento)
    WHERE id_pagamento IS NOT NULL;
