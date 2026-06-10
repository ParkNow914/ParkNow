-- Cria a tabela horarios_funcionamento, que existia em produção (linhagem
-- Sequelize antiga) mas nunca teve migration — bancos novos criados pelas
-- migrations não tinham a tabela e o módulo de horários quebrava inteiro.
-- Schema espelha models/HorarioFuncionamentoModel.js e o banco de produção.

CREATE TABLE IF NOT EXISTS horarios_funcionamento (
    id SERIAL PRIMARY KEY,
    estacionamento_id INTEGER NOT NULL REFERENCES estacionamentos(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    aberto BOOLEAN NOT NULL DEFAULT TRUE,
    horario_abertura TIME,
    horario_fechamento TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (estacionamento_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_horarios_estacionamento
    ON horarios_funcionamento(estacionamento_id);
