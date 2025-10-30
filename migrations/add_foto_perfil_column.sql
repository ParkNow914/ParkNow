-- Verifica se a coluna foto_perfil já existe na tabela usuarios
DO $$
BEGIN
    -- Verifica se a coluna já existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'usuarios' 
        AND column_name = 'foto_perfil'
    ) THEN
        -- Adiciona a coluna se não existir
        EXECUTE 'ALTER TABLE public.usuarios ADD COLUMN foto_perfil VARCHAR(255) NULL';
        RAISE NOTICE 'Coluna foto_perfil adicionada com sucesso à tabela usuarios';
    ELSE
        RAISE NOTICE 'Coluna foto_perfil já existe na tabela usuarios';
    END IF;
END $$;
