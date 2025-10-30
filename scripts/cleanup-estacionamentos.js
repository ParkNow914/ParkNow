// Script para limpar dados de estacionamentos existentes
const db = require('../config/db');
const { Pool } = require('pg');
const logger = require('../utils/logger');

async function cleanupEstacionamentos() {
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Verificar se existem estacionamentos
    const result = await client.query('SELECT id, nome FROM estacionamentos');
    
    if (result.rows.length === 0) {
      logger.info('Nenhum estacionamento encontrado no banco de dados.');
      return { success: true, message: 'Nenhum estacionamento encontrado para limpar.' };
    }
    
    logger.info(`Encontrados ${result.rows.length} estacionamentos para remoção.`);
    
    // 2. Listar estacionamentos que serão removidos
    const estacionamentos = result.rows.map(e => `${e.id} - ${e.nome}`).join('\n');
    logger.info('Estacionamentos que serão removidos:\n' + estacionamentos);
    
    // 3. Desativar triggers temporariamente para evitar problemas de chave estrangeira
    await client.query('SET session_replication_role = "replica"');
    
    // 4. Limpar tabelas na ordem correta (filhas primeiro, depois pais)
    const tablesToClean = [
      'logs_veiculos',
      'logs_admins',
      'reservas',
      'vagas',
      'estacionamentos'
    ];
    
    for (const table of tablesToClean) {
      logger.info(`Limpando tabela ${table}...`);
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      logger.info(`Tabela ${table} limpa com sucesso.`);
    }
    
    // 5. Resetar as sequências
    await client.query(`
      SELECT setval('estacionamentos_id_seq', 1, false);
      SELECT setval('vagas_id_seq', 1, false);
      SELECT setval('reservas_id_seq', 1, false);
      SELECT setval('logs_veiculos_id_seq', 1, false);
      SELECT setval('logs_admins_id_seq', 1, false);
    `);
    
    // 6. Reativar triggers
    await client.query('SET session_replication_role = "origin"');
    
    await client.query('COMMIT');
    
    logger.info('Limpeza de estacionamentos concluída com sucesso!');
    return { 
      success: true, 
      message: `Foram removidos ${result.rows.length} estacionamentos e seus dados relacionados.`
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Erro durante a limpeza de estacionamentos:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar a limpeza se o script for chamado diretamente
if (require.main === module) {
  cleanupEstacionamentos()
    .then(result => {
      console.log(result.message);
      process.exit(0);
    })
    .catch(error => {
      console.error('Erro ao limpar estacionamentos:', error);
      process.exit(1);
    });
}

module.exports = { cleanupEstacionamentos };
