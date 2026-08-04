// routes/lgpdRoutes.js
// Rotas LGPD — o próprio titular acessa (exporta) e elimina (exclui) seus dados.
// Todas exigem autenticação de usuário: protectUser é aplicado ao módulo inteiro.

const express = require('express');
const { body } = require('express-validator');
const { protectUser } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');
const lgpdController = require('../controllers/lgpdController');

const router = express.Router();

// Autenticação obrigatória em todas as rotas deste módulo.
router.use(protectUser);

// GET /api/lgpd/export — baixa todos os dados pessoais do titular (JSON).
router.get('/export', lgpdController.exportarDados);

// DELETE /api/lgpd/account — exclui/anonimiza a conta do titular.
router.delete(
    '/account',
    [body('confirmacao').isString().withMessage('A frase de confirmação é obrigatória.')],
    handleValidationErrors,
    lgpdController.excluirConta
);

module.exports = router;
