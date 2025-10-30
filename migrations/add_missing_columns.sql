-- Adiciona as colunas que estão faltando nas tabelas

-- 1. Adiciona coluna foto_perfil na tabela usuarios
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'usuarios' AND column_name = 'foto_perfil') THEN
        ALTER TABLE usuarios 
        ADD COLUMN foto_perfil TEXT;
        
        COMMENT ON COLUMN usuarios.foto_perfil IS 'URL da foto de perfil do usuário';
        
        RAISE NOTICE 'Coluna foto_perfil adicionada à tabela usuarios';
    ELSE
        RAISE NOTICE 'A coluna foto_perfil já existe na tabela usuarios';
    END IF;
END $$;

-- 2. Adiciona colunas de localização na tabela estacionamentos
DO $$
BEGIN
    -- Adiciona latitude se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'latitude') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN latitude DECIMAL(10, 8);
        
        COMMENT ON COLUMN estacionamentos.latitude IS 'Latitude geográfica do estacionamento';
        
        RAISE NOTICE 'Coluna latitude adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna latitude já existe na tabela estacionamentos';
    END IF;

    -- Adiciona longitude se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'longitude') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN longitude DECIMAL(11, 8);
        
        COMMENT ON COLUMN estacionamentos.longitude IS 'Longitude geográfica do estacionamento';
        
        RAISE NOTICE 'Coluna longitude adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna longitude já existe na tabela estacionamentos';
    END IF;
END $$;
