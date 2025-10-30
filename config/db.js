// config/db.js
// Configura e exporta a pool de conexões com o banco de dados PostgreSQL

const dbUtils = require('../utils/dbUtils'); // Importa a configuração completa do bancoo dbUtils
module.exports = {
    pool: dbUtils.pool,
    dbMiddleware: dbUtils.dbMiddleware,
    query: dbUtils.query
};