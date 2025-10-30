-- Script para gerenciamento e limpeza de contas duplicadas
-- Use este script com CUIDADO - as operações DELETE são PERMANENTES!

-- ========================================
-- PARTE 1: CONSULTAS - Ver dados atuais
-- ========================================

-- 1.1 - Listar TODOS os usuários
SELECT 'USUÁRIOS' as tipo, id, nome, email, cpf, telefone, status, data_cadastro 
FROM usuarios 
ORDER BY email;

-- 1.2 - Listar TODOS os admins
SELECT 'ADMINS' as tipo, id, nome, email, nivel_acesso, status, created_at 
FROM admins 
ORDER BY email;

-- 1.3 - Verificar emails que existem em AMBAS as tabelas (não deveria ter nenhum)
SELECT u.email, u.nome as nome_usuario, a.nome as nome_admin
FROM usuarios u 
INNER JOIN admins a ON u.email = a.email;

-- 1.4 - Verificar emails duplicados DENTRO da tabela usuarios
SELECT email, COUNT(*) as total_duplicados
FROM usuarios 
GROUP BY email 
HAVING COUNT(*) > 1;

-- 1.5 - Verificar emails duplicados DENTRO da tabela admins
SELECT email, COUNT(*) as total_duplicados
FROM admins 
GROUP BY email 
HAVING COUNT(*) > 1;

-- 1.6 - Verificar CPFs duplicados (usuarios)
SELECT cpf, COUNT(*) as total_duplicados
FROM usuarios 
WHERE cpf IS NOT NULL
GROUP BY cpf 
HAVING COUNT(*) > 1;

-- ========================================
-- PARTE 2: LIMPEZA - Remover contas
-- ========================================

-- ATENÇÃO: Descomente apenas os comandos que você quer executar!
-- Faça backup antes de executar qualquer DELETE!

-- 2.1 - Remover usuário específico por EMAIL
-- DELETE FROM usuarios WHERE email = 'email_para_remover@exemplo.com';

-- 2.2 - Remover usuário específico por ID
-- DELETE FROM usuarios WHERE id = 999;

-- 2.3 - Remover admin específico por EMAIL
-- DELETE FROM admins WHERE email = 'email_para_remover@exemplo.com';

-- 2.4 - Remover admin específico por ID
-- DELETE FROM admins WHERE id = 999;

-- 2.5 - Remover TODOS os usuários com email similar (use com MUITO cuidado!)
-- DELETE FROM usuarios WHERE email LIKE '%exemplo.com%';

-- 2.6 - Remover usuário e admin com o MESMO email (se existir duplicação)
-- BEGIN;
-- DELETE FROM usuarios WHERE email = 'email_duplicado@exemplo.com';
-- DELETE FROM admins WHERE email = 'email_duplicado@exemplo.com';
-- COMMIT;

-- ========================================
-- PARTE 3: VERIFICAÇÃO PÓS-LIMPEZA
-- ========================================

-- 3.1 - Verificar se ainda existem duplicações
SELECT 'Verificação Final - Emails em ambas tabelas:' as status;
SELECT u.email 
FROM usuarios u 
INNER JOIN admins a ON u.email = a.email;

-- 3.2 - Contar total de registros
SELECT 'usuarios' as tabela, COUNT(*) as total FROM usuarios
UNION ALL
SELECT 'admins' as tabela, COUNT(*) as total FROM admins;

-- ========================================
-- PARTE 4: EXEMPLOS ESPECÍFICOS
-- ========================================

-- Exemplo: Ver todos os dados de um usuário específico
-- SELECT * FROM usuarios WHERE email = 'alimiguel1098@hotmail.com';

-- Exemplo: Ver todos os dados de um admin específico  
-- SELECT * FROM admins WHERE email = 'alimiguel1098@gmail.com';

-- Exemplo: Ver estacionamentos de um admin
-- SELECT e.* FROM estacionamentos e WHERE e.admin_id = 7;

-- Exemplo: Remover admin E seu estacionamento
-- BEGIN;
-- DELETE FROM estacionamentos WHERE admin_id = 7;
-- DELETE FROM admins WHERE id = 7;
-- COMMIT;
