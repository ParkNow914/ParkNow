-- Adiciona a coluna created_at a tabela vagas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vagas' AND column_name = 'created_at') THEN
        ALTER TABLE vagas 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        COMMENT ON COLUMN vagas.created_at IS 'Data e hora de criacao do registro';
        
        RAISE NOTICE 'Coluna created_at adicionada a tabela vagas';
    ELSE
        RAISE NOTICE 'A coluna created_at ja existe na tabela vagas';
    END IF;
END $$;
