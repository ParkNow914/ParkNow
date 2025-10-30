/**
 * Script para migrar o código existente para usar o TransactionService.
 * Este é um guia de como atualizar o código existente.
 */

// Antes (usando transações manuais com Sequelize)
async function oldWay() {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Operações no banco de dados
    await Model1.create({ /* ... */ }, { transaction });
    await Model2.update({ /* ... */ }, { where: { /* ... */ }, transaction });
    
    // Commit se tudo der certo
    await transaction.commit();
    
  } catch (error) {
    // Rollback em caso de erro
    await transaction.rollback();
    throw error;
  }
}

// Depois (usando TransactionService)
async function newWay() {
  return await TransactionService.executeInTransaction(async (transaction) => {
    // Mesmas operações, mas sem gerenciar commit/rollback manualmente
    await Model1.create({ /* ... */ }, { transaction });
    await Model2.update({ /* ... */ }, { where: { /* ... */ }, transaction });
    
    // O TransactionService cuida do commit/rollback automaticamente
    return { success: true };
  });
}

// Exemplo de migração para transações aninhadas
async function nestedTransactions() {
  // Antes
  const t1 = await db.sequelize.transaction();
  try {
    // Operações...
    
    try {
      const t2 = await db.sequelize.transaction({ transaction: t1 });
      try {
        // Operações aninhadas...
        await t2.commit();
      } catch (error) {
        await t2.rollback();
        throw error;
      }
      
      await t1.commit();
    } catch (error) {
      await t1.rollback();
      throw error;
    }
    
  } catch (error) {
    await t1.rollback();
    throw error;
  }
  
  // Depois
  await TransactionService.executeInTransaction(async (t1) => {
    // Operações...
    
    await TransactionService.withSavepoint(t1, 'NESTED_OPERATION', async () => {
      // Operações aninhadas...
      // Se lançar erro, apenas esta parte será revertida
    });
    
    // Resto da transação principal
  });
}

// Exemplo de migração para transações em lote
async function batchOperations() {
  // Antes
  const transaction = await db.sequelize.transaction();
  const results = [];
  
  try {
    for (const item of items) {
      try {
        const result = await processItem(item, { transaction });
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error });
        throw error; // Interrompe em caso de erro
      }
    }
    
    await transaction.commit();
    return results;
    
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  
  // Depois
  return await TransactionService.executeBatch(
    items.map(item => 
      (transaction) => processItem(item, { transaction })
    )
  );
}

console.log('Script de migração carregado. Consulte os exemplos e documentação.');

// Exportar para uso em outros arquivos, se necessário
module.exports = {
  TransactionService: require('../services/transactionService')
};
