-- Adiciona as colunas chave_pix e email à tabela estacionamentos se não existirem
DO $$
BEGIN
    -- Adiciona coluna chave_pix se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'chave_pix') THEN
        ALTER TABLE estacionamentos ADD COLUMN chave_pix VARCHAR(100);
        COMMENT ON COLUMN estacionamentos.chave_pix IS 'Chave PIX do estacionamento para recebimento de pagamentos';
    END IF;
    
    -- Adiciona coluna email se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'email') THEN
        ALTER TABLE estacionamentos ADD COLUMN email VARCHAR(100);
        COMMENT ON COLUMN estacionamentos.email IS 'Email do dono do estacionamento para notificações';
    END IF;
    
    -- Atualiza a view de configurações de pagamento para incluir os campos diretos
    DROP VIEW IF EXISTS configuracao_pagamento_estacionamento;
    
    CREATE OR REPLACE VIEW configuracao_pagamento_estacionamento AS
    SELECT 
        e.id as estacionamento_id,
        e.chave_pix,
        e.email,
        'pix' as metodo_pagamento,
        true as ativo
    FROM estacionamentos e;
    
    RAISE NOTICE 'Colunas de PIX e email adicionadas com sucesso';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro ao adicionar colunas: %', SQLERRM;
END $$;
