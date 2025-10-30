-- Adiciona as colunas de preço à tabela estacionamentos se não existirem
DO $$
BEGIN
    -- Adiciona coluna preco_hora
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'preco_hora') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN preco_hora DECIMAL(10,2) NOT NULL DEFAULT 5.00;
        
        COMMENT ON COLUMN estacionamentos.preco_hora IS 'Preço por hora do estacionamento';
        
        RAISE NOTICE 'Coluna preco_hora adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna preco_hora já existe na tabela estacionamentos';
    END IF;

    -- Adiciona coluna preco_dia
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'preco_dia') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN preco_dia DECIMAL(10,2) NOT NULL DEFAULT 30.00;
        
        COMMENT ON COLUMN estacionamentos.preco_dia IS 'Preço por dia do estacionamento';
        
        RAISE NOTICE 'Coluna preco_dia adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna preco_dia já existe na tabela estacionamentos';
    END IF;

    -- Adiciona coluna descricao
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'descricao') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN descricao TEXT;
        
        COMMENT ON COLUMN estacionamentos.descricao IS 'Descrição do estacionamento';
        
        RAISE NOTICE 'Coluna descricao adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna descricao já existe na tabela estacionamentos';
    END IF;

    -- Adiciona coluna foto
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'foto') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN foto TEXT;
        
        COMMENT ON COLUMN estacionamentos.foto IS 'URL da foto do estacionamento';
        
        RAISE NOTICE 'Coluna foto adicionada à tabela estacionamentos';
    ELSE
        RAISE NOTICE 'A coluna foto já existe na tabela estacionamentos';
    END IF;
END $$;
