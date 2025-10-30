const { expect } = require('chai');
const TransactionService = require('../services/transactionService');
const db = require('../models');
const logger = require('../utils/logger');

describe('TransactionService', () => {
  // Teste para transação bem-sucedida com Sequelize
  it('deve executar uma transação com sucesso usando Sequelize', async () => {
    const result = await TransactionService.executeInTransaction(async (t) => {
      // Exemplo de operação dentro da transação
      const user = await db.User.create({
        nome: 'Test User',
        email: 'test@example.com',
        senha: 'password123',
        tipo: 'cliente'
      }, { transaction: t });
      
      return user;
    });

    expect(result).to.have.property('id');
    expect(result.email).to.equal('test@example.com');
    
    // Limpar o usuário de teste
    await db.User.destroy({ where: { email: 'test@example.com' }, force: true });
  });

  // Teste para rollback em caso de erro
  it('deve fazer rollback em caso de erro', async () => {
    let errorOccurred = false;
    
    try {
      await TransactionService.executeInTransaction(async (t) => {
        // Criar um usuário
        await db.User.create({
          nome: 'Test Rollback',
          email: 'rollback@example.com',
          senha: 'password123',
          tipo: 'cliente'
        }, { transaction: t });
        
        // Forçar um erro
        throw new Error('Erro forçado para teste de rollback');
      });
    } catch (error) {
      errorOccurred = true;
      expect(error.message).to.equal('Erro forçado para teste de rollback');
    }
    
    // Verificar se o rollback ocorreu (usuário não deve existir)
    const user = await db.User.findOne({ where: { email: 'rollback@example.com' } });
    expect(user).to.be.null;
    expect(errorOccurred).to.be.true;
  });

  // Teste para savepoints
  it('deve suportar savepoints aninhados', async () => {
    await TransactionService.executeInTransaction(async (transaction) => {
      // Criar usuário principal
      const user = await db.User.create({
        nome: 'Parent Transaction',
        email: 'parent@example.com',
        senha: 'password123',
        tipo: 'cliente'
      }, { transaction });
      
      // Criar savepoint
      await TransactionService.withSavepoint(transaction, 'SP1', async () => {
        // Operação dentro do savepoint
        await db.User.update(
          { nome: 'Parent Transaction Updated' },
          { where: { id: user.id }, transaction }
        );
        
        // Forçar um erro para testar o rollback do savepoint
        throw new Error('Erro no savepoint');
      }).catch(error => {
        // Esperado que o erro seja capturado aqui
        expect(error.message).to.equal('Erro no savepoint');
      });
      
      // Verificar se o rollback do savepoint funcionou
      const updatedUser = await db.User.findByPk(user.id, { transaction });
      expect(updatedUser.nome).to.equal('Parent Transaction');
      
      // Limpar
      await db.User.destroy({ where: { id: user.id }, transaction });
    });
  });

  // Teste para execução em lote
  it('deve executar operações em lote', async () => {
    const results = await TransactionService.executeBatch([
      async (t) => {
        return await db.User.create({
          nome: 'Batch User 1',
          email: 'batch1@example.com',
          senha: 'password123',
          tipo: 'cliente'
        }, { transaction: t });
      },
      async (t) => {
        return await db.User.create({
          nome: 'Batch User 2',
          email: 'batch2@example.com',
          senha: 'password123',
          tipo: 'cliente'
        }, { transaction: t });
      }
    ]);
    
    expect(results).to.have.lengthOf(2);
    expect(results[0].success).to.be.true;
    expect(results[1].success).to.be.true;
    
    // Limpar
    await db.User.destroy({ 
      where: { 
        email: ['batch1@example.com', 'batch2@example.com'] 
      },
      force: true 
    });
  });

  // Teste para transação com PostgreSQL puro
  it('deve executar uma transação com PostgreSQL puro', async () => {
    const result = await TransactionService.executeInTransaction(async (client) => {
      const res = await client.query(
        'INSERT INTO users (nome, email, senha, tipo) VALUES ($1, $2, $3, $4) RETURNING *',
        ['PG User', 'pg@example.com', 'password123', 'cliente']
      );
      return res.rows[0];
    }, { useSequelize: false });
    
    expect(result).to.have.property('email', 'pg@example.com');
    
    // Limpar
    await db.User.destroy({ where: { email: 'pg@example.com' }, force: true });
  });
});
