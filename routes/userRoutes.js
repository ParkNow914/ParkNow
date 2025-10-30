// routes/userRoutes.js
// Define as rotas protegidas relacionadas às ações do usuário logado (perfil).

const express = require('express');
const userController = require('../controllers/userController');
const { protectUser } = require('../middleware/authMiddleware'); // Middleware de proteção
const { body, query } = require('express-validator'); // Validação do corpo e query
const { handleValidationErrors } = require('../middleware/validationMiddleware'); // Handler
const multer = require('multer'); // Para upload de arquivos
const path = require('path'); // Para manipulação de caminhos

const router = express.Router();

// Aplica o middleware 'protectUser' a TODAS as rotas definidas abaixo.
router.use(protectUser);

// --- Validação para Atualização de Perfil ---
// Define as regras de validação que serão aplicadas na rota PUT /profile
const profileUpdateValidation = [
    // Nome: opcional para permitir atualizações parciais
    body('nome')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .escape(),
    
    // Email: Valida formato, mas o controller deve impedir a alteração real
    body('email')
        .optional()
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    
    // Telefone: Aceita formatação e remove caracteres não numéricos
    body('telefone')
        .optional()
        .trim()
        .customSanitizer(value => {
            // Remove todos os caracteres não numéricos
            return value ? value.replace(/\D/g, '') : value;
        })
        .custom(value => {
            if (!value) return true; // Campo opcional
            // Verifica se após a limpeza temos 10 ou 11 dígitos
            if (value.length < 10 || value.length > 11) {
                throw new Error('Telefone deve ter 10 ou 11 números');
            }
            return true;
        }),
    
    // Tipo de veículo: Valida se está entre as opções válidas (case insensitive)
    body('tipo_veiculo')
        .optional()
        .trim()
        .customSanitizer(value => {
            // Normaliza para primeira letra maiúscula
            if (!value) return value;
            const lowerValue = value.toLowerCase();
            const mapping = {
                'carro': 'Carro',
                'moto': 'Moto',
                'suv': 'SUV',
                'van': 'Van',
                'pickup': 'Pickup'
            };
            return mapping[lowerValue] || value;
        })
        .isIn(['Carro', 'Moto', 'SUV', 'Van', 'Pickup']).withMessage('Tipo de veículo inválido. Valores aceitos: Carro, Moto, SUV, Van, Pickup'),
    
    // Placa: Valida formato mais flexível, remove espaços e hífens
    body('placa_veiculo')
        .optional()
        .trim()
        .customSanitizer(value => {
            // Remove espaços e hífens
            return value ? value.replace(/[\s-]/g, '') : value;
        })
        .custom(value => {
            if (!value) return true; // Campo opcional
            // Formatos aceitos: AAA0000 (padrão antigo) ou AAA0A00 (padrão Mercosul)
            // Expressão regular mais flexível para aceitar ambos os formatos
            const placaRegex = /^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/;
            if (!placaRegex.test(value)) {
                throw new Error('Placa inválida. Formato esperado: AAA0000 ou AAA0A00');
            }
            return true;
        })
        .toUpperCase(),
    
    // CPF: Opcional, aceita com ou sem formatação
    body('cpf')
        .optional({ checkFalsy: true })
        .trim()
        .customSanitizer(value => {
            // Aceita CPF com ou sem formatação
            return value ? value.replace(/\D/g, '') : value;
        })
        .custom((value, { req }) => {
            if (!value) return true; // CPF é opcional
            
            // Verifica se tem 11 dígitos após remover formatação
            if (value.length !== 11) {
                throw new Error('CPF deve ter 11 dígitos');
            }
            
            // Formata o CPF no padrão 000.000.000-00 antes de salvar
            req.body.cpf = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
            return true;
        })
];

// --- Rotas de Perfil ---

// GET /api/user/profile - Obtém perfil do usuário logado
// Nenhuma validação de entrada necessária para GET simples
router.get('/profile', userController.getUserProfile);

// PUT /api/user/profile - Atualiza perfil do usuário logado
router.put('/profile',
    profileUpdateValidation, // 1. Aplica a cadeia de validação
    handleValidationErrors, // 2. Verifica se houve erros de validação
    userController.updateUserProfile // 3. Chama o controller SÓ SE a validação passar
);

// --- Upload de Imagem de Perfil ---
// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Usar o mesmo diretório que o controlador usa para salvar as imagens processadas
        const uploadDir = path.join(__dirname, '../public/user/img/profile');
        
        // Garantir que o diretório exista
        const fs = require('fs');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log(`Diretório de uploads criado: ${uploadDir}`);
        }
        
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        // Gera um nome único baseado no ID do usuário e timestamp
        const uniqueSuffix = `${req.user.id}-${Date.now()}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `profile-${uniqueSuffix}${ext}`);
    }
});

// Filtro para garantir que apenas imagens sejam enviadas
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens são permitidas (JPEG, JPG, PNG, GIF)'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // Limite de 2MB
    }
});

// POST /api/user/profile/image - Upload de imagem de perfil
router.post('/profile/image', upload.single('profileImage'), userController.uploadProfileImage);

// DELETE /api/user/profile/image - Remover imagem de perfil
router.delete('/profile/image', userController.removeProfileImage);

// --- Outras Rotas Protegidas do Usuário ---
// Ex: Histórico de ocupações (requer novo controller/model)
// router.get('/historico/ocupacoes', historicoController.getOcupacoesUsuario);

module.exports = router;