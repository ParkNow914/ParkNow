// routes/authRoutes.js
// Define as rotas para autenticação (registro, login, refresh, reset, logout).

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const upload = require('../middleware/uploadMiddleware'); // Middleware Multer para upload
const { body, param } = require('express-validator'); // Funções de validação
const { handleValidationErrors } = require('../middleware/validationMiddleware'); // Handler de erros
const auditLog = require('../middleware/auditLog');
const originCheck = require('../middleware/originCheck')();
const logger = require('../utils/logger');

const router = express.Router();

// --- Rate limiters específicos das rotas de auth ---
// Persistidos no Postgres (utils/pgRateLimitStore.js): sobrevivem a restarts
// e funcionam com múltiplas instâncias. Fail-open se o banco cair.
const { PgRateLimitStore } = require('../utils/pgRateLimitStore');

// Login: muito restritivo (anti brute-force), conta apenas falhas para não
// punir clientes legítimos que entraram com sucesso.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    store: new PgRateLimitStore({ prefix: 'auth_login' }),
    message: { success: false, error: 'too_many_login_attempts' },
    handler: (req, res, _next, options) => {
        logger.warn('[authRoutes] login rate limit hit', { ip: req.ip, requestId: req.id });
        res.status(options.statusCode).json(options.message);
    },
});

// Registro e forgot-password: limita criação massiva de contas / spam de email.
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore({ prefix: 'auth_signup' }),
    message: { success: false, error: 'too_many_signups' },
});

const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore({ prefix: 'auth_forgot' }),
    message: { success: false, error: 'too_many_password_reset_requests' },
});

// Refresh / logout: shares one limiter (anti-abuse; complements the
// Origin/Referer check applied by `originCheck`).
const refreshLogoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore({ prefix: 'auth_refresh' }),
    message: { success: false, error: 'too_many_requests' },
});

// --- Validações Reutilizáveis ---
const emailValidation = body('email', 'Email inválido').trim().isEmail().normalizeEmail();
// Valida senha para registro/reset
const passwordRegisterValidation = body('senha')
    .isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.')
    // Adicionar validações de complexidade se desejar (ex: .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/))
    .trim(); // Remove espaços extras
// Valida senha para login
const passwordLoginValidation = body('senha', 'Senha é obrigatória').notEmpty();
// Valida confirmação de senha
const confirmPasswordValidation = (fieldName = 'senha') => body('confirmarSenha')
    .custom((value, { req }) => {
        if (value !== req.body[fieldName]) { throw new Error('As senhas não coincidem.'); }
        return true;
    });

// Validação de CPF com algoritmo completo
const cpfValidation = body('cpf')
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
        if (!value) return true; // CPF é opcional
        
        // Remove formatação
        const cpf = value.replace(/\D/g, '');
        
        // Verifica se tem 11 dígitos
        if (cpf.length !== 11) {
            throw new Error('CPF deve ter 11 dígitos.');
        }
        
        // Verifica se todos os dígitos são iguais
        if (/^(\d)\1{10}$/.test(cpf)) {
            throw new Error('CPF inválido.');
        }
        
        // Validação do primeiro dígito verificador
        let soma = 0;
        for (let i = 0; i < 9; i++) {
            soma += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(9))) {
            throw new Error('CPF inválido.');
        }
        
        // Validação do segundo dígito verificador
        soma = 0;
        for (let i = 0; i < 10; i++) {
            soma += parseInt(cpf.charAt(i)) * (11 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(10))) {
            throw new Error('CPF inválido.');
        }
        
        return true;
    });

// --- Rotas de Autenticação de Usuário ---

// POST /api/auth/register - Registro de Usuário
router.post('/register', signupLimiter, auditLog('auth.register'), [
    body('nome', 'Nome é obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    emailValidation,
    passwordRegisterValidation,
    confirmPasswordValidation('senha'), // Confirma o campo 'senha'
    body('telefone', 'Telefone inválido (10 ou 11 números)').trim().matches(/^\d{10,11}$/),
    body('tipo_veiculo', 'Tipo de veículo é obrigatório').trim().notEmpty().isIn(['Carro', 'Moto', 'SUV', 'Van', 'Pickup']),
    body('placa_veiculo', 'Placa inválida (Mercosul ou antiga)').trim().matches(/^([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/i).toUpperCase(),
    cpfValidation // Validação completa de CPF
], handleValidationErrors, authController.registerUser);

// POST /api/auth/login - Login de Usuário
router.post('/login', loginLimiter, auditLog('auth.login'), [
    emailValidation,
    passwordLoginValidation
], handleValidationErrors, authController.loginUser);

// POST /api/auth/refresh-token - Renovar Access Token usando Refresh Token do cookie
// Requer Origin/Referer válido pois usa cookie (mitigação CSRF).
router.post('/refresh-token', refreshLogoutLimiter, originCheck, authController.refreshToken);

// POST /api/auth/logout - Logout (invalida refresh token)
// Idem: protege contra CSRF de logout forçado.
router.post('/logout', refreshLogoutLimiter, originCheck, auditLog('auth.logout'), authController.logout);

// POST /api/auth/forgot-password - Solicitar Redefinição de Senha
router.post('/forgot-password', forgotPasswordLimiter, auditLog('auth.forgot_password'), [
    emailValidation
], handleValidationErrors, authController.requestPasswordReset);

// POST /api/auth/reset-password/:token - Definir Nova Senha
router.post('/reset-password/:token', signupLimiter, auditLog('auth.reset_password'), [
    param('token', 'Token de redefinição inválido').isHexadecimal().isLength({ min: 64, max: 64 }),
    passwordRegisterValidation, // Reusa validação de senha de registro
    confirmPasswordValidation('password') // Confirma o campo 'password' (nome diferente no body)
], handleValidationErrors, authController.resetPassword);

// GET /api/auth/verify-email/:token - Confirma o email do usuário (link do email)
router.get('/verify-email/:token', forgotPasswordLimiter, auditLog('auth.verify_email'), authController.verifyEmail);


// --- Rotas de Autenticação de Administrador ---

// POST /api/auth/admin/register - Registro de Admin + Estacionamento
router.post('/admin/register', signupLimiter, auditLog('auth.admin.register'), [
    // 1. Middleware Multer ANTES da validação do body
    upload.single('fotoEstacionamento'),
    // 2. Validações do body
    body('nome', 'Nome admin obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    emailValidation,
    passwordRegisterValidation, // Valida senha
    confirmPasswordValidation('senha'), // Confirma senha
    body('nomeEstacionamento', 'Nome do estacionamento obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    body('enderecoEstacionamento', 'Endereço obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    body('numeroVagas', 'Número de vagas inválido (>= 0)').isInt({ min: 0 }).toInt(),
    body('precoHora', 'Preço/Hora inválido (>= 0)').isFloat({ min: 0 }).toFloat(),
    body('precoDia', 'Preço/Dia inválido (>= 0)').isFloat({ min: 0 }).toFloat(),
    body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('Latitude inválida').toFloat(),
    body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude inválida').toFloat(),
    body('descricao').optional({checkFalsy: true}).trim().isLength({ max: 1000 }).escape()
], handleValidationErrors, authController.registerAdmin);

// POST /api/auth/admin/login - Login de Admin
router.post('/admin/login', loginLimiter, auditLog('auth.admin.login'), [
    emailValidation,
    passwordLoginValidation
], handleValidationErrors, authController.loginAdmin);

// POST /api/auth/admin/logout - Logout de Admin (invalida refresh token)
router.post('/admin/logout', refreshLogoutLimiter, originCheck, auditLog('auth.admin.logout'), authController.logout);

// Adicionar rotas /admin/forgot-password, /admin/reset-password/:token se necessário

module.exports = router;