-- Adiciona a coluna vagas à tabela estacionamentos se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'vagas') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN vagas INTEGER NOT NULL DEFAULT 0;
        
        COMMENT ON COLUMN estacionamentos.vagas IS 'Número total de vagas do estacionamento';
        
        -- Atualiza os registros existentes com um valor padrão
        UPDATE estacionamentos SET vagas = 10 WHERE vagas IS NULL;
        
        RAISE NOTICE 'Coluna vagas adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna vagas já existe na tabela estacionamentos';
    END IF;
END $$;
