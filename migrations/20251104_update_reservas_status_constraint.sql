-- Migration para atualizar a constraint de status na tabela reservas
-- Data: 2025-11-04
-- Descrição: Adiciona 'pendente_pagamento' aos valores permitidos no status

-- Remove a constraint antiga se existir
ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_status_check;

-- Adiciona a nova constraint com todos os valores incluindo pendente_pagamento
ALTER TABLE reservas
ADD CONSTRAINT reservas_status_check
CHECK (status IN (
    'pendente',
    'pendente_pagamento',
    'confirmada',
    'ativa',
    'em_andamento',
    'concluida',
    'finalizada',
    'cancelada',
    'expirada',
    'nao_compareceu',
    'pagamento_aprovado',
    'pagamento_recusado'
));
