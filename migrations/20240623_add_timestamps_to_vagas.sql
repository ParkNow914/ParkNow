-- Adiciona as colunas created_at e updated_at a tabela vagas

-- Verifica se as colunas já existem
DO $$
BEGIN
    -- Adiciona created_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vagas' AND column_name = 'created_at') THEN
        ALTER TABLE vagas 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        COMMENT ON COLUMN vagas.created_at IS 'Data e hora de criacao do registro';
        
        RAISE NOTICE 'Coluna created_at adicionada a tabela vagas';
    ELSE
        RAISE NOTICE 'A coluna created_at ja existe na tabela vagas';
    END IF;

    -- Adiciona updated_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'vagas' AND column_name = 'updated_at') THEN
        ALTER TABLE vagas 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        
        COMMENT ON COLUMN vagas.updated_at IS 'Data e hora da ultima atualizacao do registro';
        
        -- Cria uma funcao para atualizar o updated_at
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
        
        -- Cria o trigger para atualizar o updated_at automaticamente
        CREATE TRIGGER update_vagas_updated_at
        BEFORE UPDATE ON vagas
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
        
        RAISE NOTICE 'Coluna updated_at adicionada a tabela vagas e trigger criado';
    ELSE
        RAISE NOTICE 'A coluna updated_at ja existe na tabela vagas';
    END IF;
END $$;
