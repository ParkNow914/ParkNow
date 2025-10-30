const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const multer = require('multer');
const authMiddleware = require('../../middleware/v2/authMiddleware');
const UserController = require('../../controllers/v2/UserController');
const { handleValidationErrors } = require('../../middleware/validationMiddleware');
const { authenticate } = authMiddleware;

// Configuração do multer para upload de arquivos em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos.'), false);
    }
  }
});

// Middleware de autenticação para todas as rotas
router.use(authenticate);

/**
 * @route   GET api/v2/users/me
 * @desc    Obter perfil do usuário autenticado
 * @access  Private
 */
router.get('/me', UserController.getUserProfile);

/**
 * @route   PUT api/v2/users/me
 * @desc    Atualizar perfil do usuário
 * @access  Private
 */
router.put(
  '/me',
  [
    check('nome', 'O nome é obrigatório').optional().not().isEmpty(),
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
      })
  ],
  handleValidationErrors,
  UserController.updateUserProfile
);

/**
 * @route   POST api/v2/users/me/avatar
 * @desc    Fazer upload da foto de perfil
 * @access  Private
 */
router.post(
  '/me/avatar',
  upload.single('avatar'),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Erro no upload do arquivo: ' + err.message 
      });
    } else if (err) {
      return res.status(400).json({ 
        success: false, 
        message: err.message 
      });
    }
    next();
  },
  UserController.uploadProfileImage
);

/**
 * @route   DELETE api/v2/users/me/avatar
 * @desc    Remover foto de perfil
 * @access  Private
 */
router.delete('/me/avatar', UserController.removeProfileImage);

module.exports = router;
