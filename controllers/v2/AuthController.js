const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { User } = require('../../models');
const { AppError, UnauthorizedError, BadRequestError } = require('../../utils/AppError');
const logger = require('../../utils/logger');
const Email = require('../../utils/email');

// Gerar token JWT
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Criar e enviar token JWT
const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user.id);
  
  // Obtém as opções de cookie do servidor e atualiza conforme necessário
  const cookieOptions = { ...req.app.get('cookieOptions') };
  cookieOptions.maxAge = process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000; // Converte dias para milissegundos
  cookieOptions.path = '/';

  // Remove a senha da saída
  user.senha = undefined;
  user.refresh_token_hash = undefined;

  // Envia o cookie com o token JWT
  res.cookie('jwt', token, cookieOptions);

  // Envia a resposta
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

/**
 * @route   POST /api/v2/auth/register
 * @desc    Registrar um novo usuário
 * @access  Public
 */
const register = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  
  try {
    const { nome, email, senha, telefone, tipo_veiculo, placa_veiculo, cpf } = req.body;
    
    // 1) Verifica se o email já está em uso
    const existingUser = await User.findOne({
      where: { email },
      transaction,
    });
    
    if (existingUser) {
      await transaction.rollback();
      return next(new BadRequestError('Este email já está em uso.'));
    }
    
    // 2) Cria o novo usuário
    const newUser = await User.create({
      nome,
      email,
      senha,
      telefone,
      tipo_veiculo,
      placa_veiculo,
      cpf,
      role: 'user', // Função padrão
      ativo: true, // Ativa a conta por padrão
    }, { transaction });
    
    // 3) Gera o token de ativação
    const activationToken = newUser.createActivationToken();
    await newUser.save({ transaction });
    
    // 4) Envia email de boas-vindas (opcional)
    try {
      const activationURL = `${req.protocol}://${req.get('host')}/api/v2/auth/activate/${activationToken}`;
      await new Email(newUser, activationURL).sendWelcome();
    } catch (err) {
      logger.error('Erro ao enviar email de boas-vindas:', err);
      // Não interrompe o fluxo se o email falhar
    }
    
    await transaction.commit();
    
    // 5) Loga o usuário automaticamente após o registro
    createSendToken(newUser, 201, req, res);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * @route   POST /api/v2/auth/login
 * @desc    Autenticar usuário e obter token
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    
    // 1) Verifica se o email e a senha foram fornecidos
    if (!email || !senha) {
      return next(new BadRequestError('Por favor, forneça email e senha.'));
    }
    
    // 2) Verifica se o usuário existe e a senha está correta
    const user = await User.findOne({ where: { email } });
    
    if (!user || !(await user.correctPassword(senha, user.senha))) {
      return next(new UnauthorizedError('Email ou senha incorretos.'));
    }
    
    // 3) Verifica se a conta está ativa
    if (!user.ativo) {
      return next(new UnauthorizedError('Sua conta está desativada. Entre em contato com o suporte.'));
    }
    
    // 4) Se tudo estiver correto, envia o token para o cliente
    createSendToken(user, 200, req, res);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/v2/auth/me
 * @desc    Obter informações do usuário autenticado
 * @access  Private
 */
const getMe = (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/v2/auth/forgot-password
 * @desc    Solicitar redefinição de senha
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  
  try {
    // 1) Busca o usuário pelo email
    const user = await User.findOne({
      where: { email: req.body.email },
      transaction,
    });
    
    if (!user) {
      await transaction.rollback();
      return next(new AppError('Não há usuário com este endereço de email.', 404));
    }
    
    // 2) Gera o token de redefinição
    const resetToken = user.createPasswordResetToken();
    await user.save({ validate: false, transaction });
    
    // 3) Envia o email com o token
    try {
      const resetURL = `${req.protocol}://${req.get('host')}/api/v2/auth/reset-password/${resetToken}`;
      await new Email(user, resetURL).sendPasswordReset();
      
      await transaction.commit();
      
      res.status(200).json({
        status: 'success',
        message: 'Token enviado para o email!',
      });
    } catch (err) {
      user.password_reset_token = undefined;
      user.password_reset_expires = undefined;
      await user.save({ validate: false, transaction });
      await transaction.rollback();
      
      return next(
        new AppError('Houve um erro ao enviar o email. Tente novamente mais tarde!', 500)
      );
    }
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * @route   PATCH /api/v2/auth/reset-password/:token
 * @desc    Redefinir senha
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  
  try {
    // 1) Busca o usuário pelo token de redefinição
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');
    
    const user = await User.findOne({
      where: {
        password_reset_token: hashedToken,
        password_reset_expires: { [Op.gt]: Date.now() },
      },
      transaction,
    });
    
    // 2) Se o token não expirou e há um usuário, define a nova senha
    if (!user) {
      await transaction.rollback();
      return next(new AppError('Token inválido ou expirado', 400));
    }
    
    // 3) Atualiza a senha e limpa os campos de redefinição
    user.senha = req.body.senha;
    user.password_reset_token = null;
    user.password_reset_expires = null;
    
    // 4) Salva o usuário (o hook de senha será acionado)
    await user.save({ transaction });
    await transaction.commit();
    
    // 5) Loga o usuário e envia o token JWT
    createSendToken(user, 200, req, res);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * @route   PATCH /api/v2/auth/update-password
 * @desc    Atualizar senha (usuário autenticado)
 * @access  Private
 */
const updatePassword = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  
  try {
    // 1) Busca o usuário pelo ID
    const user = await User.findByPk(req.user.id, {
      transaction,
    });
    
    // 2) Verifica se a senha atual está correta
    if (!(await user.correctPassword(req.body.senha_atual, user.senha))) {
      await transaction.rollback();
      return next(new UnauthorizedError('Sua senha atual está incorreta.'));
    }
    
    // 3) Atualiza a senha
    user.senha = req.body.nova_senha;
    await user.save({ transaction });
    
    // 4) Loga o usuário novamente e envia o novo token JWT
    await transaction.commit();
    createSendToken(user, 200, req, res);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * @route   GET /api/v2/auth/logout
 * @desc    Deslogar usuário (limpa o cookie JWT)
 * @access  Private
 */
const logout = (req, res) => {
  // Obtém as opções de cookie do servidor e atualiza para expirar o cookie
  const cookieOptions = { ...req.app.get('cookieOptions') };
  cookieOptions.maxAge = 0; // Expira o cookie imediatamente
  
  // Limpa o cookie JWT
  res.clearCookie('jwt', cookieOptions);
  
  res.status(200).json({ status: 'success' });
};

module.exports = {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  updatePassword,
  logout,
};
