-- Cria a funcao para atualizar o updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o trigger
DROP TRIGGER IF EXISTS update_vagas_updated_at ON vagas;
CREATE TRIGGER update_vagas_updated_at
BEFORE UPDATE ON vagas
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
