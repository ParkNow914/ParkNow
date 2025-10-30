-- Migração para renomear a coluna id_reserva para reserva_id
DO $$
BEGIN
    -- Verifica se a tabela pagamentos existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pagamentos') THEN
        -- Verifica se a coluna id_reserva existe e a renomeia para reserva_id
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'pagamentos' AND column_name = 'id_reserva'
        ) AND NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'pagamentos' AND column_name = 'reserva_id'
        ) THEN
            -- Renomeia a coluna
            ALTER TABLE pagamentos 
            RENAME COLUMN id_reserva TO reserva_id;
            
            RAISE NOTICE 'Coluna id_reserva renomeada para reserva_id';
        END IF;
        
        -- Adiciona a chave estrangeira se não existir
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE table_name = 'pagamentos' 
            AND constraint_name = 'fk_reserva'
        ) THEN
            -- Remove a chave estrangeira antiga se existir
            IF EXISTS (
                SELECT 1 
                FROM information_schema.table_constraints 
                WHERE table_name = 'pagamentos' 
                AND constraint_name = 'pagamentos_id_reserva_fkey'
            ) THEN
                ALTER TABLE pagamentos 
                DROP CONSTRAINT pagamentos_id_reserva_fkey;
            END IF;
            
            -- Adiciona a nova chave estrangeira
            ALTER TABLE pagamentos
            ADD CONSTRAINT fk_reserva 
            FOREIGN KEY (reserva_id) 
            REFERENCES reservas(id) 
            ON DELETE CASCADE;
            
            RAISE NOTICE 'Constraint fk_reserva adicionada à tabela pagamentos';
        END IF;
        
        -- Cria índices se não existirem
        CREATE INDEX IF NOT EXISTS idx_pagamentos_reserva_id ON pagamentos(reserva_id);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status);
        CREATE INDEX IF NOT EXISTS idx_pagamentos_created_at ON pagamentos(created_at);
        
        RAISE NOTICE 'Índices criados/verificados com sucesso';
    ELSE
        RAISE NOTICE 'Tabela pagamentos não existe. Nada a fazer.';
    END IF;
    
    RAISE NOTICE 'Migração concluída com sucesso';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro durante a migração: %', SQLERRM;
END $$;
