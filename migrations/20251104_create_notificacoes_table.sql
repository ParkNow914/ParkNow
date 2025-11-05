-- Migration para criar a tabela notificacoes
-- Data: 2025-11-04
-- Descrição: Tabela para armazenar notificações do sistema

CREATE TABLE IF NOT EXISTS notificacoes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    dados JSONB,
    lida BOOLEAN DEFAULT FALSE,
    data_criacao TIMESTAMP DEFAULT NOW(),
    data_leitura TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_data_criacao ON notificacoes(data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON notificacoes(tipo);

-- Comentários
COMMENT ON TABLE notificacoes IS 'Tabela para armazenar notificações do sistema';
COMMENT ON COLUMN notificacoes.usuario_id IS 'ID do usuário que receberá a notificação';
COMMENT ON COLUMN notificacoes.tipo IS 'Tipo da notificação (pix_copiado, pix_visualizado, pagamento_confirmado, etc)';
COMMENT ON COLUMN notificacoes.titulo IS 'Título da notificação';
COMMENT ON COLUMN notificacoes.mensagem IS 'Mensagem/corpo da notificação';
COMMENT ON COLUMN notificacoes.dados IS 'Dados adicionais em formato JSON';
COMMENT ON COLUMN notificacoes.lida IS 'Se a notificação foi lida ou não';
COMMENT ON COLUMN notificacoes.data_criacao IS 'Data e hora de criação da notificação';
COMMENT ON COLUMN notificacoes.data_leitura IS 'Data e hora em que a notificação foi lida';
