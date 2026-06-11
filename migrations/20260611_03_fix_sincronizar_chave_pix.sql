-- Repara a função sincronizar_chave_pix() em bancos existentes: ela fazia
-- UPDATE estacionamentos SET ... data_atualizacao = NOW(), mas a tabela
-- estacionamentos não tem essa coluna em nenhuma linhagem de schema — o que
-- quebrava QUALQUER INSERT/UPDATE em estacionamento_pagamentos (ou seja,
-- nenhum estacionamento conseguia cadastrar a chave PIX em banco novo).
-- A função agora sincroniza apenas as colunas de chave PIX, que existem em
-- todas as linhagens.

CREATE OR REPLACE FUNCTION sincronizar_chave_pix()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE estacionamentos
    SET chave_pix = NEW.chave_pix,
        tipo_chave_pix = NEW.tipo_chave_pix,
        nome_titular_pix = NEW.nome_titular
    WHERE id = NEW.estacionamento_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
