const express = require('express');
const router = express.Router();
const veiculoController = require('../controllers/veiculoController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Aplica o middleware de autenticação em todas as rotas
router.use(authenticateToken);

// Rotas para veículos
router.get('/', veiculoController.getVeiculos);
router.get('/:id', veiculoController.getVeiculo);
router.post('/', veiculoController.createVeiculo);
router.put('/:id', veiculoController.updateVeiculo);
router.delete('/:id', veiculoController.deleteVeiculo);
router.post('/:id/padrao', veiculoController.setVeiculoPadrao);

module.exports = router;
