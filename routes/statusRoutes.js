// Rotas para verificar o status do servidor e suas conexões
const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');
const { protectUser, protectAdmin } = require('../middleware/authMiddleware');

// Rota pública para verificar o status básico do servidor
router.get('/health', (req, res) => {
    res.status(200).json({ status: 'online', timestamp: new Date().toISOString() });
});

// Rota protegida para verificar o status detalhado do servidor (apenas admin)
router.get('/server', protectAdmin, statusController.getServerStatus);

// Rota protegida para verificar o status da conexão do usuário atual
router.get('/connection', protectUser, statusController.getUserConnectionStatus);

module.exports = router;
