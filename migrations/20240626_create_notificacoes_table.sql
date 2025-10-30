-- Criação da tabela de notificações
CREATE TABLE IF NOT EXISTS notificacoes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    lida BOOLEAN NOT NULL DEFAULT FALSE,
    dados_adicionais JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Índices para melhorar consultas comuns
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_created_at ON notificacoes(created_at);

-- Comentários para documentação
COMMENT ON TABLE notificacoes IS 'Armazena as notificações do sistema para os usuários';
COMMENT ON COLUMN notificacoes.usuario_id IS 'ID do usuário destinatário da notificação';
COMMENT ON COLUMN notificacoes.tipo IS 'Tipo da notificação (ex: pix_copiado, pagamento_confirmado)';
COMMENT ON COLUMN notificacoes.titulo IS 'Título da notificação';
COMMENT ON COLUMN notificacoes.mensagem IS 'Mensagem completa da notificação';
COMMENT ON COLUMN notificacoes.lida IS 'Indica se a notificação foi lida';
COMMENT ON COLUMN notificacoes.dados_adicionais IS 'Dados adicionais da notificação em formato JSON';

-- Trigger para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica a trigger à tabela notificacoes
DROP TRIGGER IF EXISTS update_notificacoes_updated_at ON notificacoes;
CREATE TRIGGER update_notificacoes_updated_at
BEFORE UPDATE ON notificacoes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
