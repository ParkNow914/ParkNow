// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const contactController = require('../controllers/contactController');

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
router.post('/message', contactValidation, contactController.sendContactMessage);

// Rota para inscrição na newsletter
router.post('/newsletter', newsletterValidation, contactController.subscribeNewsletter);

// Rota para solicitação de parceria com o ParkNow
router.post('/solicitar-parceria', contactController.solicitarParceria);

module.exports = router;
