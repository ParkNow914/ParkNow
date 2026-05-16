const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const { AppError, UnauthorizedError, ForbiddenError } = require('../../utils/AppError');
const _logger = require('../../utils/logger');

/**
 * Middleware para verificar se o usuário está autenticado
 */
const authenticate = async (req, res, next) => {
  try {
    // 1) Verifica se o token JWT está presente no cabeçalho Authorization
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return next(
        new UnauthorizedError('Você não está logado. Por favor, faça login para acessar este recurso.')
      );
    }

    // 2) Verifica e decodifica o token JWT
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.JWT_SECRET, (err, decodedToken) => {
        if (err) {
          reject(new UnauthorizedError('Token inválido ou expirado. Por favor, faça login novamente.'));
        } else {
          resolve(decodedToken);
        }
      });
    });

    // 3) Verifica se o usuário ainda existe no banco de dados
    const currentUser = await User.findByPk(decoded.id, {
      attributes: { exclude: ['senha', 'refresh_token_hash'] },
    });

    if (!currentUser) {
      return next(
        new UnauthorizedError('O usuário associado a este token não existe mais.')
      );
    }

    // 4) Verifica se o usuário alterou a senha após o token ter sido emitido
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new UnauthorizedError('Senha alterada recentemente. Por favor, faça login novamente.')
      );
    }

    // 5) Se tudo estiver correto, adiciona o usuário ao objeto de requisição
    req.user = currentUser;
    res.locals.user = currentUser;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar se o usuário tem permissão de administrador
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError('Você não tem permissão para executar esta ação.')
      );
    }
    next();
  };
};

/**
 * Middleware para verificar se o usuário é o dono do recurso ou um administrador
 */
const isOwnerOrAdmin = (model, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      // Se for admin, permite o acesso
      if (req.user.role === 'admin') return next();

      // Busca o recurso no banco de dados
      const resource = await model.findByPk(req.params[paramName]);
      
      if (!resource) {
        return next(new AppError('Recurso não encontrado.', 404));
      }

      // Verifica se o usuário é o dono do recurso
      if (resource.userId !== req.user.id) {
        return next(
          new ForbiddenError('Você não tem permissão para acessar este recurso.')
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authenticate,
  authorizeRoles,
  isOwnerOrAdmin,
  // Adicione outros middlewares conforme necessário
};
