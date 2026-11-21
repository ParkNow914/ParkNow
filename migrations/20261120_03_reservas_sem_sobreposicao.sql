-- C-03 (auditoria 2026-11-20): o próprio banco impede duas reservas ativas
-- na mesma vaga com períodos sobrepostos, mesmo com requisições simultâneas.
--
-- Arquivo separado de propósito: se já existirem reservas antigas sobrepostas,
-- a criação falha, o runner (modo padrão) registra o erro e tenta de novo no
-- próximo deploy, sem bloquear as outras correções. Para destravar, cancele ou
-- corrija as reservas listadas por:
--   SELECT a.id, b.id FROM reservas a JOIN reservas b
--     ON a.vaga_id = b.vaga_id AND a.id < b.id
--    AND tsrange(a.data_entrada_prevista, a.data_saida_prevista) &&
--        tsrange(b.data_entrada_prevista, b.data_saida_prevista)
--  WHERE a.status IN ('pendente','pendente_pagamento','pagamento_aprovado','confirmada','ativa','em_andamento')
--    AND b.status IN ('pendente','pendente_pagamento','pagamento_aprovado','confirmada','ativa','em_andamento');
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_sem_sobreposicao') THEN
        ALTER TABLE reservas
            ADD CONSTRAINT reservas_sem_sobreposicao
            EXCLUDE USING gist (
                vaga_id WITH =,
                tsrange(data_entrada_prevista, data_saida_prevista, '[)') WITH &&
            )
            WHERE (
                status IN ('pendente', 'pendente_pagamento', 'pagamento_aprovado',
                           'confirmada', 'ativa', 'em_andamento')
                AND data_saida_prevista > data_entrada_prevista
            );
    END IF;
END $$;
