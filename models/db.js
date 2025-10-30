// models/db.js
// Exporta a pool de conexões do banco de dados para ser usada pelos models.

const dbUtils = require('../utils/dbUtils'); // Importa a configuração completa do banco

// Exporta a pool diretamente para manter a compatibilidade
module.exports = dbUtils.pool; // Exporta a pool configurada corretamente