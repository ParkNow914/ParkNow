const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const AuthController = require('../../controllers/v2/AuthController');
const { authenticate } = require('../../middleware/v2/authMiddleware');
const { handleValidationErrors } = require('../../middleware/validationMiddleware');

// Rotas públicas
router.post(
  '/register',
  [
    check('nome', 'O nome é obrigatório').not().isEmpty(),
    check('email', 'Por favor, forneça um email válido').isEmail(),
    check('senha', 'A senha deve ter no mínimo 8 caracteres').isLength({ min: 8 }),
    check('telefone', 'Telefone inválido').optional().isMobilePhone('pt-BR'),
    check('tipo_veiculo', 'Tipo de veículo inválido')
      .optional()
      .isIn(['Carro', 'Moto', 'SUV', 'Van', 'Pickup']),
    check('placa_veiculo', 'Placa de veículo inválida')
      .optional()
      .matches(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i),
    check('cpf', 'CPF inválido')
      .optional()
      .custom((value) => {
        // Remove all non-numeric characters
        const cpf = value.replace(/[^\d]/g, '');
        
        // Check if it has 11 digits and not all digits are the same
        if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
          return false;
        }
        
        // Validate first digit
        let sum = 0;
        for (let i = 0; i < 9; i++) {
          sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let remainder = 11 - (sum % 11);
        const digit1 = remainder >= 10 ? 0 : remainder;
        
        // Validate second digit
        sum = 0;
        for (let i = 0; i < 10; i++) {
          sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        remainder = 11 - (sum % 11);
        const digit2 = remainder >= 10 ? 0 : remainder;
        
        // Check if digits match
        return digit1 === parseInt(cpf.charAt(9)) && digit2 === parseInt(cpf.charAt(10));
      }),
  ],
  handleValidationErrors,
  AuthController.register
);

router.post(
  '/login',
  [
    check('email', 'Por favor, forneça um email válido').isEmail(),
    check('senha', 'A senha é obrigatória').exists(),
  ],
  handleValidationErrors,
  AuthController.login
);

router.post(
  '/forgot-password',
  [check('email', 'Por favor, forneça um email válido').isEmail()],
  handleValidationErrors,
  AuthController.forgotPassword
);

router.patch(
  '/reset-password/:token',
  [
    check('senha', 'A senha deve ter no mínimo 8 caracteres').isLength({ min: 8 }),
    check('senhaConfirmacao', 'As senhas não conferem').custom(
      (value, { req }) => value === req.body.senha
    ),
  ],
  handleValidationErrors,
  AuthController.resetPassword
);

// Rotas protegidas (requerem autenticação)
router.use(authenticate);

router.get('/me', AuthController.getMe);
router.patch('/update-password', AuthController.updatePassword);
router.get('/logout', AuthController.logout);

module.exports = router;
