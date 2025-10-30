-- Adiciona a coluna refresh_token_hash à tabela usuarios se ela não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'usuarios' AND column_name = 'refresh_token_hash') THEN
        ALTER TABLE usuarios 
        ADD COLUMN refresh_token_hash TEXT;
        
        COMMENT ON COLUMN usuarios.refresh_token_hash IS 'Hash do refresh token JWT para invalidar tokens';
        
        RAISE NOTICE 'Coluna refresh_token_hash adicionada à tabela usuarios';
    ELSE
        RAISE NOTICE 'A coluna refresh_token_hash já existe na tabela usuarios';
    END IF;
END $$;
