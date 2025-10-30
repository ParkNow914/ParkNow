-- Adiciona a coluna tipo_veiculo à tabela usuarios se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'usuarios' AND column_name = 'tipo_veiculo') THEN
        ALTER TABLE usuarios 
        ADD COLUMN tipo_veiculo VARCHAR(50);
        
        COMMENT ON COLUMN usuarios.tipo_veiculo IS 'Tipo de veículo do usuário (ex: carro, moto, etc.)';
        
        RAISE NOTICE 'Coluna tipo_veiculo adicionada à tabela usuarios';
    ELSE
        RAISE NOTICE 'A coluna tipo_veiculo já existe na tabela usuarios';
    END IF;
END $$;
