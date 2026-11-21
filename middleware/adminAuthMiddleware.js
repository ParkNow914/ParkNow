// middleware/adminAuthMiddleware.js
// Mantido por compatibilidade de import. A implementação única de
// autenticação de admin (com checagem de status no banco e papel de
// superadmin) fica em middleware/authMiddleware.js.
const { protectAdmin, requireSuperAdmin } = require('./authMiddleware');

module.exports = { protectAdmin, requireSuperAdmin };
