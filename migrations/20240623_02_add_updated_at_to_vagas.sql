-- Adiciona a coluna updated_at e trigger a tabela vagas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vagas' AND column_name = 'updated_at') THEN
        -- Primeiro adiciona a coluna
        ALTER TABLE vagas 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        COMMENT ON COLUMN vagas.updated_at IS 'Data e hora da ultima atualizacao do registro';
        
        -- Cria a funcao para atualizar o updated_at
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        -- Cria o trigger
        DROP TRIGGER IF EXISTS update_vagas_updated_at ON vagas;
        CREATE TRIGGER update_vagas_updated_at
        BEFORE UPDATE ON vagas
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
        
        RAISE NOTICE 'Coluna updated_at e trigger adicionados a tabela vagas';
    ELSE
        RAISE NOTICE 'A coluna updated_at ja existe na tabela vagas';
    END IF;
END $$;
