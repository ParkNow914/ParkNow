// migrations/20240623_add_status_pagamento_to_reservas.js
const { Pool } = require('pg');
const { dbConfig } = require('../config/database');

async function runMigration() {
  const pool = new Pool(dbConfig);
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verifica se a coluna já existe
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'reservas' AND column_name = 'status_pagamento';
    `;
    
    const result = await client.query(checkQuery);
    
    if (result.rows.length === 0) {
      // Adiciona a coluna status_pagamento se não existir
      console.log('Adicionando coluna status_pagamento à tabela reservas...');
      await client.query(`
        ALTER TABLE reservas 
        ADD COLUMN status_pagamento VARCHAR(20) DEFAULT 'pending';
      `);
      
      console.log('Coluna status_pagamento adicionada com sucesso!');
    } else {
      console.log('A coluna status_pagamento já existe na tabela reservas.');
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao executar migração:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executa a migração
runMigration()
  .then(() => {
    console.log('Migração concluída com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Falha na migração:', error);
    process.exit(1);
  });
