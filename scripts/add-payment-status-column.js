const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'parknow_db',
  password: process.env.PG_PASSWORD || 'postgres',
  port: process.env.PG_PORT || 5432,
});

async function addPaymentStatusColumn() {
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
      console.log('Adicionando coluna status_pagamento à tabela reservas...');
      
      // Adiciona a coluna status_pagamento
      await client.query(`
        ALTER TABLE reservas 
        ADD COLUMN status_pagamento VARCHAR(20) DEFAULT 'pending';
      `);
      
      // Adiciona a coluna data_pagamento se não existir
      await client.query(`
        ALTER TABLE reservas 
        ADD COLUMN IF NOT EXISTS data_pagamento TIMESTAMP WITH TIME ZONE;
      `);
      
      console.log('Colunas adicionadas com sucesso!');
    } else {
      console.log('A coluna status_pagamento já existe na tabela reservas.');
    }
    
    await client.query('COMMIT');
    console.log('Migração concluída com sucesso!');
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
addPaymentStatusColumn()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Falha na migração:', error);
    process.exit(1);
  });
