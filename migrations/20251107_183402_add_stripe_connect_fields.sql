-- Migração para adicionar campos do Stripe Connect
-- Data: 2024-11-07
-- Descrição: Adiciona campos necessários para integração com Stripe Connect (marketplace/split)

-- ============================================
-- 1. Adicionar campos Stripe na tabela estacionamentos
-- ============================================

-- Adicionar coluna para ID da conta conectada Stripe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'stripe_account_id') THEN
        ALTER TABLE estacionamentos
        ADD COLUMN stripe_account_id VARCHAR(255) UNIQUE;
        
        COMMENT ON COLUMN estacionamentos.stripe_account_id IS 'ID da conta conectada no Stripe';
    END IF;
END $$;

-- Adicionar coluna para status da conta Stripe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'stripe_account_status') THEN
        ALTER TABLE estacionamentos
        ADD COLUMN stripe_account_status VARCHAR(50) DEFAULT 'not_connected';
        
        COMMENT ON COLUMN estacionamentos.stripe_account_status IS 'Status da conta Stripe (not_connected, created, pending, active)';
    END IF;
END $$;

-- Adicionar coluna para data de onboarding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'stripe_onboarded_at') THEN
        ALTER TABLE estacionamentos
        ADD COLUMN stripe_onboarded_at TIMESTAMP WITH TIME ZONE;
        
        COMMENT ON COLUMN estacionamentos.stripe_onboarded_at IS 'Data em que completou o onboarding do Stripe';
    END IF;
END $$;

-- Adicionar coluna para charges habilitados
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'stripe_charges_enabled') THEN
        ALTER TABLE estacionamentos
        ADD COLUMN stripe_charges_enabled BOOLEAN DEFAULT FALSE;
        
        COMMENT ON COLUMN estacionamentos.stripe_charges_enabled IS 'Se pode receber pagamentos via Stripe';
    END IF;
END $$;

-- Adicionar coluna para payouts habilitados
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'estacionamentos' AND column_name = 'stripe_payouts_enabled') THEN
        ALTER TABLE estacionamentos
        ADD COLUMN stripe_payouts_enabled BOOLEAN DEFAULT FALSE;
        
        COMMENT ON COLUMN estacionamentos.stripe_payouts_enabled IS 'Se pode receber transferências via Stripe';
    END IF;
END $$;

-- Criar índice para busca rápida por stripe_account_id
CREATE INDEX IF NOT EXISTS idx_estacionamentos_stripe_account 
    ON estacionamentos(stripe_account_id) 
    WHERE stripe_account_id IS NOT NULL;

-- ============================================
-- 2. Adicionar campos Stripe na tabela pagamentos
-- ============================================

-- Adicionar coluna para Payment Intent ID
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pagamentos' AND column_name = 'stripe_payment_intent_id') THEN
        ALTER TABLE pagamentos
        ADD COLUMN stripe_payment_intent_id VARCHAR(255) UNIQUE;
        
        COMMENT ON COLUMN pagamentos.stripe_payment_intent_id IS 'ID do PaymentIntent no Stripe';
    END IF;
END $$;

-- Adicionar coluna para Transfer ID
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pagamentos' AND column_name = 'stripe_transfer_id') THEN
        ALTER TABLE pagamentos
        ADD COLUMN stripe_transfer_id VARCHAR(255);
        
        COMMENT ON COLUMN pagamentos.stripe_transfer_id IS 'ID da transferência para o estacionamento';
    END IF;
END $$;

-- Adicionar coluna para comissão da plataforma
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pagamentos' AND column_name = 'comissao_plataforma') THEN
        ALTER TABLE pagamentos
        ADD COLUMN comissao_plataforma DECIMAL(10, 2);
        
        COMMENT ON COLUMN pagamentos.comissao_plataforma IS 'Valor retido pela ParkNow (split)';
    END IF;
END $$;

-- Adicionar coluna para valor do estacionamento
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pagamentos' AND column_name = 'valor_estacionamento') THEN
        ALTER TABLE pagamentos
        ADD COLUMN valor_estacionamento DECIMAL(10, 2);
        
        COMMENT ON COLUMN pagamentos.valor_estacionamento IS 'Valor transferido ao estacionamento';
    END IF;
END $$;

-- Criar índice para busca rápida por payment_intent_id
CREATE INDEX IF NOT EXISTS idx_pagamentos_stripe_pi 
    ON pagamentos(stripe_payment_intent_id) 
    WHERE stripe_payment_intent_id IS NOT NULL;

-- Criar índice para busca por transfer_id
CREATE INDEX IF NOT EXISTS idx_pagamentos_stripe_transfer 
    ON pagamentos(stripe_transfer_id) 
    WHERE stripe_transfer_id IS NOT NULL;

-- ============================================
-- 3. Atualizar constraint de métodos de pagamento (se necessário)
-- ============================================

-- Verificar e atualizar constraint de metodo_pagamento se existir
DO $$
BEGIN
    -- Remover constraint antiga se existir
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'pagamentos' 
        AND constraint_name = 'check_metodo_valido'
    ) THEN
        ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS check_metodo_valido;
    END IF;
    
    -- Adicionar nova constraint com métodos atualizados
    ALTER TABLE pagamentos
    ADD CONSTRAINT check_metodo_valido CHECK (
        metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'stripe_pix', 'stripe_card', 'stripe_boleto')
    );
END $$;

-- ============================================
-- 4. Função para validar split de pagamento
-- ============================================

CREATE OR REPLACE FUNCTION validar_split_pagamento()
RETURNS TRIGGER AS $$
BEGIN
    -- Se tiver comissão da plataforma, deve ter valor do estacionamento
    IF NEW.comissao_plataforma IS NOT NULL AND NEW.valor_estacionamento IS NULL THEN
        RAISE EXCEPTION 'Pagamento com comissão deve ter valor do estacionamento definido';
    END IF;
    
    -- Se tiver valor do estacionamento, deve ter comissão
    IF NEW.valor_estacionamento IS NOT NULL AND NEW.comissao_plataforma IS NULL THEN
        RAISE EXCEPTION 'Pagamento com valor de estacionamento deve ter comissão definida';
    END IF;
    
    -- Validar que a soma bate com o valor total
    IF NEW.comissao_plataforma IS NOT NULL AND NEW.valor_estacionamento IS NOT NULL THEN
        IF ABS((NEW.comissao_plataforma + NEW.valor_estacionamento) - NEW.valor) > 0.01 THEN
            RAISE EXCEPTION 'Soma da comissão (%) + valor do estacionamento (%) deve ser igual ao valor total (%)',
                NEW.comissao_plataforma, NEW.valor_estacionamento, NEW.valor;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para validação
DROP TRIGGER IF EXISTS trigger_validar_split_pagamento ON pagamentos;
CREATE TRIGGER trigger_validar_split_pagamento
    BEFORE INSERT OR UPDATE ON pagamentos
    FOR EACH ROW
    EXECUTE FUNCTION validar_split_pagamento();

-- ============================================
-- 5. Função para atualizar status do estacionamento baseado no Stripe
-- ============================================

CREATE OR REPLACE FUNCTION atualizar_status_stripe_estacionamento()
RETURNS TRIGGER AS $$
BEGIN
    -- Se charges_enabled e payouts_enabled forem true, marcar como active
    IF NEW.stripe_charges_enabled = TRUE AND NEW.stripe_payouts_enabled = TRUE THEN
        NEW.stripe_account_status := 'active';
        
        -- Registrar data de onboarding se ainda não foi registrada
        IF NEW.stripe_onboarded_at IS NULL THEN
            NEW.stripe_onboarded_at := NOW();
        END IF;
    -- Se tiver account_id mas ainda não estiver active, marcar como pending
    ELSIF NEW.stripe_account_id IS NOT NULL AND NEW.stripe_account_status = 'not_connected' THEN
        NEW.stripe_account_status := 'pending';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualização automática de status
DROP TRIGGER IF EXISTS trigger_atualizar_status_stripe ON estacionamentos;
CREATE TRIGGER trigger_atualizar_status_stripe
    BEFORE INSERT OR UPDATE ON estacionamentos
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_status_stripe_estacionamento();

-- ============================================
-- 6. View para relatório de splits
-- ============================================

CREATE OR REPLACE VIEW vw_splits_pagamento AS
SELECT 
    p.id AS pagamento_id,
    p.reserva_id,
    p.valor AS valor_total,
    p.comissao_plataforma,
    p.valor_estacionamento,
    ROUND((p.comissao_plataforma / NULLIF(p.valor, 0)) * 100, 2) AS percentual_comissao,
    p.stripe_payment_intent_id,
    p.stripe_transfer_id,
    p.status,
    p.created_at,
    r.estacionamento_id,
    e.nome AS estacionamento_nome,
    e.stripe_account_id
FROM pagamentos p
INNER JOIN reservas r ON p.reserva_id = r.id
INNER JOIN estacionamentos e ON r.estacionamento_id = e.id
WHERE p.comissao_plataforma IS NOT NULL;

COMMENT ON VIEW vw_splits_pagamento IS 'View para análise de splits de pagamento entre plataforma e estacionamentos';

-- ============================================
-- 7. Índices adicionais para performance
-- ============================================

-- Índice composto para buscar pagamentos pendentes de um estacionamento via Stripe
CREATE INDEX IF NOT EXISTS idx_pagamentos_stripe_status 
    ON pagamentos(status, stripe_payment_intent_id) 
    WHERE stripe_payment_intent_id IS NOT NULL;

-- Índice para buscar estacionamentos ativos no Stripe
CREATE INDEX IF NOT EXISTS idx_estacionamentos_stripe_active 
    ON estacionamentos(stripe_charges_enabled, stripe_payouts_enabled) 
    WHERE stripe_account_id IS NOT NULL;

-- ============================================
-- 8. Mensagens finais
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migração Stripe Connect concluída com sucesso!';
    RAISE NOTICE '📊 Campos adicionados:';
    RAISE NOTICE '   - estacionamentos: stripe_account_id, stripe_account_status, stripe_charges_enabled, etc.';
    RAISE NOTICE '   - pagamentos: stripe_payment_intent_id, comissao_plataforma, valor_estacionamento';
    RAISE NOTICE '🔧 Triggers criados para validação automática de splits';
    RAISE NOTICE '📈 View vw_splits_pagamento criada para relatórios';
    RAISE NOTICE '';
    RAISE NOTICE '⚙️  Próximos passos:';
    RAISE NOTICE '   1. Configurar variáveis de ambiente (STRIPE_SECRET_KEY, etc.)';
    RAISE NOTICE '   2. Registrar rotas Stripe no servidor';
    RAISE NOTICE '   3. Testar criação de conta conectada';
    RAISE NOTICE '   4. Configurar webhook do Stripe';
END $$;
