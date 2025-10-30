-- Script para criar as tabelas no PostgreSQL
-- Baseado na estrutura do MySQL

-- Desativa temporariamente as verificações de chaves estrangeiras
SET session_replication_role = 'replica';

-- Tabela: usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    cpf VARCHAR(14) UNIQUE,
    telefone VARCHAR(15),
    senha VARCHAR(255) NOT NULL,
    tipo_usuario VARCHAR(20) NOT NULL DEFAULT 'cliente',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acesso TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    email_verified_at TIMESTAMP
);

-- Tabela: estacionamentos
CREATE TABLE IF NOT EXISTS estacionamentos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cnpj VARCHAR(18) UNIQUE,
    endereco TEXT,
    telefone VARCHAR(15),
    email VARCHAR(100),
    capacidade_total INTEGER NOT NULL,
    vagas_disponiveis INTEGER NOT NULL,
    valor_hora DECIMAL(10,2) NOT NULL,
    valor_diaria DECIMAL(10,2) NOT NULL,
    valor_mensal DECIMAL(10,2) NOT NULL,
    horario_abertura TIME NOT NULL,
    horario_fechamento TIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: tipos_veiculos
CREATE TABLE IF NOT EXISTS tipos_veiculos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    descricao TEXT,
    fator_preco DECIMAL(3,2) DEFAULT 1.00
);

-- Tabela: vagas
CREATE TABLE IF NOT EXISTS vagas (
    id SERIAL PRIMARY KEY,
    numero INTEGER NOT NULL,
    estacionamento_id INTEGER NOT NULL REFERENCES estacionamentos(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'livre' CHECK (status IN ('livre', 'ocupada', 'reservada', 'indisponivel')),
    placa VARCHAR(10),
    tipo_veiculo VARCHAR(50),
    entrada TIMESTAMP,
    tempo_estacionado INTEGER DEFAULT 0,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    reserva_id_ativa INTEGER,
    UNIQUE (estacionamento_id, numero)
);

-- Tabela: reservas
CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vaga_id INTEGER NOT NULL REFERENCES vagas(id) ON DELETE CASCADE,
    estacionamento_id INTEGER NOT NULL REFERENCES estacionamentos(id) ON DELETE CASCADE,
    data_reserva TIMESTAMP NOT NULL,
    data_entrada_prevista TIMESTAMP NOT NULL,
    data_saida_prevista TIMESTAMP NOT NULL,
    data_entrada_real TIMESTAMP,
    data_saida_real TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'cancelada', 'finalizada')),
    valor_total DECIMAL(10,2),
    forma_pagamento VARCHAR(50),
    status_pagamento VARCHAR(20) DEFAULT 'pendente',
    codigo_reserva VARCHAR(20) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: logs_veiculos
CREATE TABLE IF NOT EXISTS logs_veiculos (
    id SERIAL PRIMARY KEY,
    vaga_id INTEGER REFERENCES vagas(id) ON DELETE SET NULL,
    estacionamento_id INTEGER REFERENCES estacionamentos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo_operacao VARCHAR(20) NOT NULL CHECK (tipo_operacao IN ('entrada', 'saida', 'reserva', 'cancelamento')),
    placa_veiculo VARCHAR(10),
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    detalhes TEXT
);

-- Tabela: logs_admins
CREATE TABLE IF NOT EXISTS logs_admins (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER,
    acao VARCHAR(50) NOT NULL,
    tabela_afetada VARCHAR(50),
    registro_id INTEGER,
    valores_antigos JSONB,
    valores_novos JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: admins
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    nivel_acesso VARCHAR(20) NOT NULL DEFAULT 'operador',
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    ultimo_acesso TIMESTAMP,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices adicionais
CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_reservas_estacionamento ON reservas(estacionamento_id);
CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
CREATE INDEX IF NOT EXISTS idx_vagas_status ON vagas(estacionamento_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_veiculos_data ON logs_veiculos(data_hora);
CREATE INDEX IF NOT EXISTS idx_logs_admins_created ON logs_admins(created_at);

-- Chaves estrangeiras adicionais para vagas
ALTER TABLE vagas 
    ADD CONSTRAINT fk_vaga_reserva_ativa 
    FOREIGN KEY (reserva_id_ativa) 
    REFERENCES reservas(id) 
    ON DELETE SET NULL;

-- Ativa as verificações de chaves estrangeiras
SET session_replication_role = 'origin';
