-- Script para adicionar validação de email único entre tabelas usuarios e admins
-- Garante que um email não possa existir simultaneamente em ambas as tabelas

-- 1. Criar função que valida email único entre tabelas
CREATE OR REPLACE FUNCTION check_email_across_tables() 
RETURNS TRIGGER AS $$
BEGIN
    -- Se estamos inserindo/atualizando em usuarios, verifica se email existe em admins
    IF TG_TABLE_NAME = 'usuarios' THEN
        IF EXISTS (SELECT 1 FROM admins WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % já cadastrado como administrador', NEW.email;
        END IF;
    -- Se estamos inserindo/atualizando em admins, verifica se email existe em usuarios
    ELSIF TG_TABLE_NAME = 'admins' THEN
        IF EXISTS (SELECT 1 FROM usuarios WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % já cadastrado como usuário', NEW.email;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Criar trigger para tabela usuarios
DROP TRIGGER IF EXISTS prevent_duplicate_email_usuarios ON usuarios;
CREATE TRIGGER prevent_duplicate_email_usuarios
    BEFORE INSERT OR UPDATE OF email ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION check_email_across_tables();

-- 3. Criar trigger para tabela admins
DROP TRIGGER IF EXISTS prevent_duplicate_email_admins ON admins;
CREATE TRIGGER prevent_duplicate_email_admins
    BEFORE INSERT OR UPDATE OF email ON admins
    FOR EACH ROW
    EXECUTE FUNCTION check_email_across_tables();

-- 4. Validar se já existem duplicações (deve retornar 0 rows)
SELECT 'VALIDAÇÃO - Emails duplicados entre tabelas:' as status;
SELECT u.email, 'Existe em ambas as tabelas!' as problema
FROM usuarios u 
INNER JOIN admins a ON u.email = a.email;

-- 5. Testar a proteção (isso deve FALHAR com erro)
-- Descomente as linhas abaixo para testar:
-- INSERT INTO usuarios (nome, email, senha) VALUES ('Teste', 'thalessoares475@gmail.com', 'teste123');
-- Resultado esperado: ERRO: Email thalessoares475@gmail.com já cadastrado como administrador
