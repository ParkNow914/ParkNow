// routes/lgpdRoutes.js
// Rotas LGPD — o próprio titular acessa (exporta) e elimina (exclui) seus dados.
// Todas exigem autenticação de usuário: protectUser é aplicado ao módulo inteiro.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { protectUser } = require('../middleware/authMiddleware');
const { handleValidationErrors } = require('../middleware/validationMiddleware');
const lgpdController = require('../controllers/lgpdController');

const router = express.Router();

// Rate limit dedicado: operações LGPD são sensíveis e pesadas (o export lê
// várias tabelas; o account apaga/anonimiza dados). Limita abuso mesmo com um
// token válido, e antes da autenticação (barra tentativas anônimas também).
const lgpdLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Muitas solicitações de LGPD deste IP. Tente novamente mais tarde.',
});

router.use(lgpdLimiter);
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
