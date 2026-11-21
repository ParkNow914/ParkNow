-- C-07 (auditoria 2026-11-20): solicitações de parceria antigas guardavam a
-- senha em texto puro em parceria_solicitacoes.dados->>'senha'.
-- Converte cada uma para hash bcrypt (formato $2a$, aceito pelo login de admin
-- via bcrypt.compare) e apaga o texto puro.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE parceria_solicitacoes
   SET dados = (dados - 'senha')
               || jsonb_build_object('senha_hash', crypt(dados->>'senha', gen_salt('bf', 12)))
 WHERE dados ? 'senha'
   AND coalesce(dados->>'senha', '') <> '';

-- Restos vazios do campo antigo.
UPDATE parceria_solicitacoes
   SET dados = dados - 'senha'
 WHERE dados ? 'senha';
