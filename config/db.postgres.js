const { Sequelize } = require('sequelize');
const _config = require('./index');
const logger = require('../utils/logger');

function resolveSequelizeSsl() {
  const explicit = String(process.env.PG_SSL || '').toLowerCase();
  if (explicit === 'false' || explicit === '0') return false;
  if (explicit === 'true' || explicit === '1') return { require: true, rejectUnauthorized: false };
  return process.env.NODE_ENV === 'production' ? { require: true, rejectUnauthorized: false } : false;
}

// Configuração da conexão com PostgreSQL
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'parknow_db',
  username: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  logging: process.env.NODE_ENV === 'development' ? msg => logger.debug(msg) : false,
  define: {
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  },
  pool: {
    max: parseInt(process.env.PG_MAX_CONNECTIONS) || 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    ssl: resolveSequelizeSsl()
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
