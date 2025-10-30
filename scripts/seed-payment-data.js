require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Configuração do banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/parknow',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para executar queries
const query = async (text, params) => {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
};

// Função para criar um hash de senha
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Dados iniciais
const seedData = async () => {
  try {
    console.log('Iniciando seed de dados de pagamento...');

    // 1. Criar um usuário de teste (se não existir)
    console.log('Criando usuário de teste...');
    const email = 'teste@parknow.com.br';
    const senha = await hashPassword('senha123');
    
    let usuario = await query(
      'SELECT id FROM usuarios WHERE email = $1', 
      [email]
    );

    if (usuario.rows.length === 0) {
      usuario = await query(
        `INSERT INTO usuarios (
          nome, email, senha, telefone, cpf, data_nascimento, 
          tipo_usuario, email_confirmado, ativo, data_criacao
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id`,
        [
          'Usuário Teste',
          email,
          senha,
          '11999999999',
          '12345678901',
          '1990-01-01',
          'usuario',
          true,
          true
        ]
      );
      console.log('Usuário de teste criado com sucesso!');
    } else {
      console.log('Usuário de teste já existe, pulando criação...');
    }

    // 2. Criar um estacionamento de teste (se não existir)
    console.log('Criando estacionamento de teste...');
    const cnpj = '12345678000199'; // CNPJ válido para testes
    
    let estacionamento = await query(
      'SELECT id FROM estacionamentos WHERE cnpj = $1',
      [cnpj]
    );

    if (estacionamento.rows.length === 0) {
      estacionamento = await query(
        `INSERT INTO estacionamentos (
          nome, cnpj, telefone, email, endereco, numero, complemento, 
          bairro, cidade, estado, cep, quantidade_vagas, valor_hora, 
          valor_diaria, valor_mensal, ativo, data_criacao, chave_pix, 
          tipo_chave_pix, nome_titular_pix, aceita_cartao_credito, 
          aceita_cartao_debito
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
          $15, $16, NOW(), $17, $18, $19, $20, $21
        ) RETURNING id`,
        [
          'Estacionamento Teste',
          cnpj,
          '1122223333',
          'contato@estacionamentoteste.com.br',
          'Rua Teste',
          '123',
          'Sala 1',
          'Centro',
          'São Paulo',
          'SP',
          '01001000',
          50,
          10.0,
          70.0,
          300.0,
          true,
          cnpj, // Chave PIX é o próprio CNPJ
          'CNPJ',
          'Estacionamento Teste LTDA',
          true,
          true
        ]
      );
      console.log('Estacionamento de teste criado com sucesso!');
    } else {
      console.log('Estacionamento de teste já existe, atualizando...');
      // Atualiza os campos de pagamento se necessário
      await query(
        `UPDATE estacionamentos 
         SET chave_pix = $1, tipo_chave_pix = $2, nome_titular_pix = $3,
             aceita_cartao_credito = $4, aceita_cartao_debito = $5
         WHERE cnpj = $6`,
        [
          cnpj,
          'CNPJ',
          'Estacionamento Teste LTDA',
          true,
          true,
          cnpj
        ]
      );
      estacionamento = await query('SELECT id FROM estacionamentos WHERE cnpj = $1', [cnpj]);
    }

    const estacionamentoId = estacionamento.rows[0].id;

    // 3. Configurar pagamento do estacionamento (se não existir)
    console.log('Configurando pagamento do estacionamento...');
    const configPagamento = await query(
      'SELECT id FROM estacionamento_pagamentos WHERE estacionamento_id = $1',
      [estacionamentoId]
    );

    if (configPagamento.rows.length === 0) {
      await query(
        `INSERT INTO estacionamento_pagamentos (
          estacionamento_id, tipo_chave_pix, chave_pix, nome_titular, 
          banco, tipo_conta, agencia, conta, data_criacao, data_atualizacao
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )`,
        [
          estacionamentoId,
          'CNPJ',
          cnpj,
          'Estacionamento Teste LTDA',
          'Banco do Brasil',
          'CONTA_CORRENTE',
          '0001',
          '123456-7'
        ]
      );
      console.log('Configuração de pagamento criada com sucesso!');
    } else {
      console.log('Configuração de pagamento já existe, pulando criação...');
    }

    // 4. Criar vagas de teste (se não existirem)
    console.log('Verificando vagas de teste...');
    const vagas = await query(
      'SELECT id FROM vagas WHERE estacionamento_id = $1',
      [estacionamentoId]
    );

    if (vagas.rows.length === 0) {
      // Cria 10 vagas de teste
      for (let i = 1; i <= 10; i++) {
        await query(
          `INSERT INTO vagas (
            estacionamento_id, identificador, tipo, coberta, acessivel, 
            status, data_criacao, data_atualizacao
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            estacionamentoId,
            `VAGA-${i.toString().padStart(2, '0')}`,
            'padrao',
            i % 2 === 0, // Alterna entre coberta e descoberta
            i % 3 === 0, // Uma a cada 3 vagas é acessível
            'disponivel'
          ]
        );
      }
      console.log('10 vagas de teste criadas com sucesso!');
    } else {
      console.log(`${vagas.rows.length} vagas já existentes, pulando criação...`);
    }

    console.log('Seed de dados de pagamento concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('Erro ao executar seed:', error);
    process.exit(1);
  }
};

// Executa o seed
seedData();
