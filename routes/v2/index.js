const express = require('express');
const router = express.Router();

// Importar rotas
const userRoutes = require('./userRoutes');
const authRoutes = require('./authRoutes');

// Rotas de autenticação
router.use('/auth', authRoutes);

// Rotas de usuários (protegidas)
router.use('/users', userRoutes);

// Rota de verificação de saúde da API
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API v2 está funcionando corretamente',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Exportar o roteador
module.exports = router;
