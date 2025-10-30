const { sequelize } = require('../config/db.postgres');
const logger = require('../utils/logger');

async function checkDatabase() {
  try {
    // Tenta autenticar
    await sequelize.authenticate();
    logger.info('Conexão com o PostgreSQL estabelecida com sucesso!');
    
    // Verifica se o banco de dados existe
    const [results] = await sequelize.query(
      "SELECT 1 FROM pg_database WHERE datname = 'parknow_db'"
    );
    
    if (results.length > 0) {
      logger.info('O banco de dados parknow_db já existe');
    } else {
      logger.warn('O banco de dados parknow_db NÃO existe');
    }
    
    // Lista as tabelas existentes
    const tables = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    
    logger.info(`\nTabelas encontradas (${tables[0].length}):`);
    tables[0].forEach(table => {
      logger.info(`- ${table.table_name}`);
    });
    
  } catch (error) {
    logger.error('Erro ao verificar o banco de dados:', error);
  } finally {
    await sequelize.close();
  }
}

checkDatabase();
