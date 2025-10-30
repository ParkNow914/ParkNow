-- Adiciona a coluna placa_veiculo à tabela usuarios se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'usuarios' AND column_name = 'placa_veiculo') THEN
        ALTER TABLE usuarios 
        ADD COLUMN placa_veiculo VARCHAR(10);
        
        COMMENT ON COLUMN usuarios.placa_veiculo IS 'Placa do veículo do usuário';
        
        RAISE NOTICE 'Coluna placa_veiculo adicionada à tabela usuarios';
    ELSE
        RAISE NOTICE 'A coluna placa_veiculo já existe na tabela usuarios';
    END IF;
END $$;
