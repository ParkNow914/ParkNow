// routes/contactRoutes.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { body } = require('express-validator');
const contactController = require('../controllers/contactController');
const { PgRateLimitStore } = require('../utils/pgRateLimitStore');
const { verifyTurnstile } = require('../middleware/turnstile');

// Estas rotas são públicas e disparam e-mail: sem limite viram canal de spam
// e podem derrubar a conta de e-mail do sistema.
const contatoLimiter = (prefix, max) => rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore({ prefix }),
  message: { success: false, message: 'Muitas solicitações. Tente novamente mais tarde.' },
});
const mensagemLimiter = contatoLimiter('contact_message', 5);
const newsletterLimiter = contatoLimiter('contact_newsletter', 5);
const parceriaLimiter = contatoLimiter('contact_parceria', 3);

// Validação para o formulário de contato
const contactValidation = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório')
    .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
  body('email').trim().notEmpty().withMessage('Email é obrigatório')
    .isEmail().withMessage('Email inválido'),
  body('assunto').trim().notEmpty().withMessage('Assunto é obrigatório')
    .isLength({ min: 3, max: 100 }).withMessage('Assunto deve ter entre 3 e 100 caracteres'),
  body('mensagem').trim().notEmpty().withMessage('Mensagem é obrigatória')
    .isLength({ min: 10, max: 2000 }).withMessage('Mensagem deve ter entre 10 e 2000 caracteres')
];

// Validação para inscrição na newsletter
const newsletterValidation = [
  body('email').trim().notEmpty().withMessage('Email é obrigatório')
    .isEmail().withMessage('Email inválido'),
  body('nome').optional().trim()
];

// Rota para enviar mensagem de contato
router.post('/message', mensagemLimiter, verifyTurnstile(), contactValidation, contactController.sendContactMessage);

// Rota para inscrição na newsletter
router.post('/newsletter', newsletterLimiter, verifyTurnstile(), newsletterValidation, contactController.subscribeNewsletter);

// Rota para solicitação de parceria com o ParkNow
router.post('/solicitar-parceria', parceriaLimiter, verifyTurnstile(), contactController.solicitarParceria);

module.exports = router;
