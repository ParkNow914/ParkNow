const { Sequelize } = require('sequelize');
const _config = require('./index');
const logger = require('../utils/logger');

// Configuração da conexão com PostgreSQL
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'parknow_db',
  username: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '91827364Now#',
  logging: process.env.NODE_ENV === 'development' ? msg => logger.debug(msg) : false,
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Testar a conexão
async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('Conexão com PostgreSQL estabelecida com sucesso!');
  } catch (error) {
    logger.error('Não foi possível conectar ao PostgreSQL:', error);
    process.exit(1);
  }
}

testConnection();

module.exports = {
  sequelize,
  Sequelize
};
