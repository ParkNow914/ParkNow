const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

async function createDatabase() {
  // Conecta ao banco de dados 'postgres' (banco de sistema)
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: 'postgres', // Conecta ao banco padrão
    username: process.env.PG_USER || 'postgres',
    // Senha obrigatória via ambiente — sem fallback embutido.
    password: process.env.PG_PASSWORD,
    logging: false
  });

  try {
    await sequelize.authenticate();
    logger.info('Conexão com o PostgreSQL estabelecida com sucesso!');
    
    // Cria o banco de dados se não existir
    await sequelize.query(`CREATE DATABASE parknow_db`);
    logger.info('Banco de dados parknow_db criado com sucesso!');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      logger.warn('O banco de dados parknow_db já existe');
    } else {
      logger.error('Erro ao criar o banco de dados:', error);
    }
  } finally {
    await sequelize.close();
  }
}

createDatabase();
