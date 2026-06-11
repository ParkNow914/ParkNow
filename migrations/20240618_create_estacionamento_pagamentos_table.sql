-- Criação da tabela de configurações de pagamento dos estacionamentos
CREATE TABLE IF NOT EXISTS estacionamento_pagamentos (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL,
    tipo_chave_pix VARCHAR(20) NOT NULL,
    chave_pix VARCHAR(140) NOT NULL,
    nome_titular VARCHAR(255) NOT NULL,
    banco VARCHAR(100),
    tipo_conta VARCHAR(20) DEFAULT 'CONTA_CORRENTE',
    agencia VARCHAR(20),
    conta VARCHAR(50),
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data_exclusao TIMESTAMP WITH TIME ZONE,
    
    -- Restrições
    CONSTRAINT fk_estacionamento FOREIGN KEY (estacionamento_id) REFERENCES estacionamentos(id) ON DELETE CASCADE,
    CONSTRAINT uk_estacionamento_pagamento UNIQUE (estacionamento_id),
    CONSTRAINT ck_tipo_chave_pix_valido CHECK (
        tipo_chave_pix IN ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA')
    ),
    CONSTRAINT ck_tipo_conta_valido CHECK (
        tipo_conta IN ('CONTA_CORRENTE', 'CONTA_POUPANCA', 'CONTA_PAGAMENTO')
    )
);

-- Índices para melhorar a performance
CREATE INDEX IF NOT EXISTS idx_estacionamento_pagamentos_estacionamento_id 
    ON estacionamento_pagamentos(estacionamento_id);

CREATE INDEX IF NOT EXISTS idx_estacionamento_pagamentos_chave_pix 
    ON estacionamento_pagamentos(chave_pix);

-- Comentários para documentação
COMMENT ON TABLE estacionamento_pagamentos IS 'Armazena as configurações de pagamento dos estacionamentos, incluindo chaves PIX e dados bancários';
COMMENT ON COLUMN estacionamento_pagamentos.estacionamento_id IS 'Referência ao estacionamento';
COMMENT ON COLUMN estacionamento_pagamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA)';
COMMENT ON COLUMN estacionamento_pagamentos.chave_pix IS 'Valor da chave PIX';
COMMENT ON COLUMN estacionamento_pagamentos.nome_titular IS 'Nome do titular da conta';
COMMENT ON COLUMN estacionamento_pagamentos.banco IS 'Nome do banco (opcional)';
COMMENT ON COLUMN estacionamento_pagamentos.tipo_conta IS 'Tipo de conta bancária';
COMMENT ON COLUMN estacionamento_pagamentos.agencia IS 'Número da agência (opcional)';
COMMENT ON COLUMN estacionamento_pagamentos.conta IS 'Número da conta (opcional)';

-- Trigger para atualizar automaticamente a data de atualização
CREATE OR REPLACE FUNCTION atualizar_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_estacionamento_pagamentos_atualizacao
BEFORE UPDATE ON estacionamento_pagamentos
FOR EACH ROW
EXECUTE FUNCTION atualizar_data_atualizacao();

-- Adiciona a coluna chave_pix na tabela estacionamentos para facilitar consultas
DO $$
BEGIN
    -- Verifica se a coluna já existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'chave_pix') THEN
        -- Adiciona a coluna se não existir
        ALTER TABLE estacionamentos 
        ADD COLUMN chave_pix VARCHAR(140);
        
        COMMENT ON COLUMN estacionamentos.chave_pix IS 'Chave PIX do estacionamento (mantida em sincronia com estacionamento_pagamentos)';
        
        -- Cria um índice na coluna chave_pix
        CREATE INDEX IF NOT EXISTS idx_estacionamentos_chave_pix ON estacionamentos(chave_pix);
        
        RAISE NOTICE 'Coluna chave_pix adicionada à tabela estacionamentos';
    END IF;
END $$;

-- Função para manter a chave_pix na tabela estacionamentos sincronizada
CREATE OR REPLACE FUNCTION sincronizar_chave_pix()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualiza a chave PIX espelhada na tabela estacionamentos quando um
    -- registro for inserido/atualizado em estacionamento_pagamentos.
    -- IMPORTANTE: não tocar em colunas de timestamp aqui — as linhagens de
    -- schema divergem (updated_at vs data_atualizacao vs nenhuma) e o trigger
    -- quebrava TODO cadastro de chave PIX em bancos criados pelas migrations.
    UPDATE estacionamentos
    SET chave_pix = NEW.chave_pix,
        tipo_chave_pix = NEW.tipo_chave_pix,
        nome_titular_pix = NEW.nome_titular
    WHERE id = NEW.estacionamento_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria as triggers para sincronização
DROP TRIGGER IF EXISTS tr_sincronizar_chave_pix_ins ON estacionamento_pagamentos;
CREATE TRIGGER tr_sincronizar_chave_pix_ins
AFTER INSERT ON estacionamento_pagamentos
FOR EACH ROW
EXECUTE FUNCTION sincronizar_chave_pix();

DROP TRIGGER IF EXISTS tr_sincronizar_chave_pix_upd ON estacionamento_pagamentos;
CREATE TRIGGER tr_sincronizar_chave_pix_upd
AFTER UPDATE OF chave_pix ON estacionamento_pagamentos
FOR EACH ROW
WHEN (OLD.chave_pix IS DISTINCT FROM NEW.chave_pix)
EXECUTE FUNCTION sincronizar_chave_pix();

-- Função para limpar a chave_pix quando um registro for excluído (soft delete)
CREATE OR REPLACE FUNCTION limpar_chave_pix()
RETURNS TRIGGER AS $$
BEGIN
    -- Remove a chave_pix da tabela estacionamentos quando um registro for excluído em estacionamento_pagamentos
    UPDATE estacionamentos
    SET chave_pix = NULL,
        data_atualizacao = NOW()
    WHERE id = OLD.estacionamento_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Cria a trigger para limpeza em caso de exclusão
DROP TRIGGER IF EXISTS tr_limpar_chave_pix ON estacionamento_pagamentos;
CREATE TRIGGER tr_limpar_chave_pix
BEFORE DELETE ON estacionamento_pagamentos
FOR EACH ROW
EXECUTE FUNCTION limpar_chave_pix();
