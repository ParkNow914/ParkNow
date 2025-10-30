-- Criação da tabela de veículos
CREATE TABLE IF NOT EXISTS veiculos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_veiculo VARCHAR(20) NOT NULL,
    placa_veiculo VARCHAR(10) NOT NULL,
    padrao BOOLEAN NOT NULL DEFAULT FALSE,
    data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(usuario_id, placa_veiculo)
);

-- Adiciona índice para melhorar buscas por usuário
CREATE INDEX IF NOT EXISTS idx_veiculos_usuario_id ON veiculos(usuario_id);

-- Migra os veículos existentes da tabela de usuários para a nova tabela
DO $$
DECLARE
    usuario_record RECORD;
    veiculo_id INTEGER;
BEGIN
    -- Para cada usuário que tem veículo cadastrado
    FOR usuario_record IN 
        SELECT id, tipo_veiculo, placa_veiculo 
        FROM usuarios 
        WHERE tipo_veiculo IS NOT NULL AND placa_veiculo IS NOT NULL
    LOOP
        -- Insere o veículo na nova tabela
        INSERT INTO veiculos (usuario_id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao)
        VALUES (
            usuario_record.id, 
            usuario_record.tipo_veiculo, 
            usuario_record.placa_veiculo, 
            TRUE, -- Marca como veículo padrão
            NOW(), 
            NOW()
        )
        ON CONFLICT (usuario_id, placa_veiculo) DO NOTHING
        RETURNING id INTO veiculo_id;
        
        -- Se o veículo foi inserido, podemos fazer mais alguma coisa aqui se necessário
        -- Por exemplo, registrar no log
        IF veiculo_id IS NOT NULL THEN
            RAISE NOTICE 'Migrado veículo % para usuário %', usuario_record.placa_veiculo, usuario_record.id;
        END IF;
    END LOOP;
    
    -- Remove as colunas antigas (opcional, podemos fazer em outra migração)
    -- ALTER TABLE usuarios DROP COLUMN IF EXISTS tipo_veiculo;
    -- ALTER TABLE usuarios DROP COLUMN IF EXISTS placa_veiculo;
END $$;
