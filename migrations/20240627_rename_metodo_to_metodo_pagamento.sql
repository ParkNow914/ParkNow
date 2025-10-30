-- Migração para renomear a coluna 'metodo' para 'metodo_pagamento' na tabela pagamentos
DO $$
BEGIN
    -- Verifica se a tabela pagamentos existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pagamentos') THEN
        -- Verifica se a coluna 'metodo' existe e 'metodo_pagamento' não existe
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'pagamentos' AND column_name = 'metodo'
        ) AND NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'pagamentos' AND column_name = 'metodo_pagamento'
        ) THEN
            -- Renomeia a coluna 'metodo' para 'metodo_pagamento'
            ALTER TABLE pagamentos RENAME COLUMN metodo TO metodo_pagamento;
            
            RAISE NOTICE 'Coluna "metodo" renomeada para "metodo_pagamento" com sucesso.';
        ELSE
            RAISE NOTICE 'A coluna "metodo" não existe ou a coluna "metodo_pagamento" já existe. Nenhuma alteração necessária.';
        END IF;
    ELSE
        RAISE NOTICE 'Tabela "pagamentos" não encontrada. Nenhuma alteração realizada.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Erro ao renomear a coluna: %', SQLERRM;
END $$;
