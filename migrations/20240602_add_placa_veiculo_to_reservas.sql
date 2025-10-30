-- Adiciona a coluna placa_veiculo à tabela reservas
ALTER TABLE reservas 
ADD COLUMN placa_veiculo VARCHAR(10);

-- Atualiza as reservas existentes com a placa do veículo do usuário, se disponível
UPDATE reservas r
SET placa_veiculo = u.placa_veiculo
FROM usuarios u
WHERE r.usuario_id = u.id AND r.placa_veiculo IS NULL;

-- Torna a coluna obrigatória para novas inserções
ALTER TABLE reservas 
ALTER COLUMN placa_veiculo SET NOT NULL;
