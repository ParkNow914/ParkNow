-- Adiciona as colunas que estão faltando nas tabelas

-- 1. Adiciona colunas PIX na tabela estacionamentos se não existirem
DO $$
BEGIN
    -- Verifica e adiciona cada coluna individualmente
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'tipo_chave_pix') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN tipo_chave_pix VARCHAR(20);
        
        COMMENT ON COLUMN estacionamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, telefone, email, aleatoria)';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'chave_pix') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN chave_pix VARCHAR(255);
        
        COMMENT ON COLUMN estacionamentos.chave_pix IS 'Chave PIX do estacionamento';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'estacionamentos' AND column_name = 'nome_titular_pix') THEN
        ALTER TABLE estacionamentos 
        ADD COLUMN nome_titular_pix VARCHAR(100);
        
        COMMENT ON COLUMN estacionamentos.nome_titular_pix IS 'Nome do titular da conta PIX';
    END IF;
END $$;

-- 2. Adiciona coluna status_reserva na tabela reservas se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'reservas' AND column_name = 'status_reserva') THEN
        -- Primeiro adiciona a coluna sem a restrição CHECK
        ALTER TABLE reservas 
        ADD COLUMN status_reserva VARCHAR(20) DEFAULT 'pendente';
        
        -- Atualiza o status_reserva baseado no status atual
        UPDATE reservas SET status_reserva = status 
        WHERE status IN ('pendente', 'confirmada', 'cancelada', 'finalizada', 'ativa');
        
        -- Adiciona a restrição CHECK após a atualização dos dados
        ALTER TABLE reservas 
        ADD CONSTRAINT check_status_reserva 
        CHECK (status_reserva IN ('pendente', 'confirmada', 'cancelada', 'finalizada', 'ativa'));
        
        -- Adiciona comentário para documentação
        COMMENT ON COLUMN reservas.status_reserva IS 'Status da reserva (pendente, confirmada, cancelada, finalizada, ativa)';
    END IF;
END $$;
