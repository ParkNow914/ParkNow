-- Adiciona a coluna placa_veiculo à tabela reservas (idempotente: o baseline
-- de bancos novos pode ou não já conter a coluna)
ALTER TABLE reservas
ADD COLUMN IF NOT EXISTS placa_veiculo VARCHAR(10);

-- Atualiza as reservas existentes com a placa do veículo do usuário, se a
-- coluna de origem existir (em bancos recém-criados a ordem alfabética
-- colocaria add_placa_veiculo_column.sql depois desta migration)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'usuarios' AND column_name = 'placa_veiculo') THEN
        UPDATE reservas r
        SET placa_veiculo = u.placa_veiculo
        FROM usuarios u
        WHERE r.usuario_id = u.id AND r.placa_veiculo IS NULL;
    END IF;
END $$;

-- Torna a coluna obrigatória para novas inserções (paridade com produção)
ALTER TABLE reservas
ALTER COLUMN placa_veiculo SET NOT NULL;
