-- Migration: Adicionar colunas de saída e valor à tabela logs_veiculos
-- Data: 2025-11-11
-- Descrição: Adiciona colunas para registrar saída, tempo estacionado e valor pago

-- Adicionar coluna de saída (timestamp da saída)
ALTER TABLE logs_veiculos 
ADD COLUMN IF NOT EXISTS saida TIMESTAMP WITH TIME ZONE;

-- Adicionar coluna de tempo estacionado em segundos
ALTER TABLE logs_veiculos 
ADD COLUMN IF NOT EXISTS tempo_estacionado INTEGER DEFAULT 0;

-- Adicionar coluna de valor pago
ALTER TABLE logs_veiculos 
ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10, 2);

-- Adicionar coluna de entrada (para compatibilidade com código existente)
ALTER TABLE logs_veiculos 
ADD COLUMN IF NOT EXISTS entrada TIMESTAMP WITH TIME ZONE;

-- Copiar data_hora para entrada nos registros de tipo 'entrada' onde entrada é null
UPDATE logs_veiculos 
SET entrada = data_hora 
WHERE tipo_operacao = 'entrada' AND entrada IS NULL;

-- Copiar data_hora para saida nos registros de tipo 'saida' onde saida é null
UPDATE logs_veiculos 
SET saida = data_hora 
WHERE tipo_operacao = 'saida' AND saida IS NULL;

-- Criar índice para buscar logs abertos (sem saída)
CREATE INDEX IF NOT EXISTS idx_logs_veiculos_saida_null 
ON logs_veiculos (vaga_id, entrada DESC) 
WHERE saida IS NULL;

-- Criar índice para buscar logs por vaga
CREATE INDEX IF NOT EXISTS idx_logs_veiculos_vaga 
ON logs_veiculos (vaga_id, entrada DESC);

-- Comentários nas colunas
COMMENT ON COLUMN logs_veiculos.entrada IS 'Data/hora de entrada do veículo';
COMMENT ON COLUMN logs_veiculos.saida IS 'Data/hora de saída do veículo';
COMMENT ON COLUMN logs_veiculos.tempo_estacionado IS 'Tempo estacionado em segundos';
COMMENT ON COLUMN logs_veiculos.valor_pago IS 'Valor pago pelo estacionamento';
