const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errors');

/**
 * Middleware para verificar o token JWT
 */
const authenticate = (req, res, next) => {
  try {
    // Obter o token do cabeçalho Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token de autenticação não fornecido', 401);
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new AppError('Token de autenticação inválido', 401);
    }
    
    // Verificar e decodificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Adicionar os dados do usuário ao objeto de requisição
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
      isAdmin: decoded.role === 'admin'
    };
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Token de autenticação inválido', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expirado', 401));
    }
    next(error);
  }
};

/**
 * Middleware para verificar permissões de administrador
 */
const isAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(new AppError('Acesso negado. Permissão de administrador necessária.', 403));
  }
  next();
};

/**
 * Middleware para verificar se o usuário é o dono do recurso ou um administrador
 * @param {string} resourceUserId - ID do usuário dono do recurso
 */
const isOwnerOrAdmin = (resourceUserId) => {
  return (req, res, next) => {
    if (req.user.isAdmin || req.user.id === resourceUserId) {
      return next();
    }
    next(new AppError('Acesso negado. Você não tem permissão para acessar este recurso.', 403));
  };
};

/**
 * Middleware para verificar funções específicas
 * @param {...string} roles - Funções permitidas
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Usuário não autenticado', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Acesso negado. A função ${req.user.role} não tem permissão para acessar este recurso.`,
          403
        )
      );
    }
    
    next();
  };
};

/**
 * Middleware para verificar permissões baseadas em escopo
 * @param {string} action - Ação a ser realizada (ex: 'read', 'write', 'delete')
 * @param {string} resource - Recurso a ser acessado (ex: 'payments', 'users')
 */
const checkPermission = (action, resource) => {
  return async (req, res, next) => {
    try {
      // Aqui você pode implementar a lógica para verificar permissões específicas
      // Por exemplo, verificar em um banco de dados se o usuário tem permissão
      // para realizar a ação no recurso especificado
      
      // Exemplo simples baseado em roles
      if (req.user.isAdmin) {
        return next();
      }
      
      // Verificar se o usuário tem permissão específica
      // Esta é uma implementação de exemplo - ajuste conforme necessário
      const hasPermission = await checkUserPermission(req.user.id, action, resource);
      
      if (!hasPermission) {
        return next(
          new AppError(
            `Acesso negado. Você não tem permissão para ${action} ${resource}.`,
            403
          )
        );
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Função auxiliar para verificar permissões no banco de dados
async function checkUserPermission(userId, action, resource) {
  // Implemente a lógica para verificar permissões no seu banco de dados
  // Retorne true se o usuário tiver permissão, false caso contrário
  // Este é um exemplo simplificado
  return false;
}

module.exports = {
  authenticate,
  isAdmin,
  isOwnerOrAdmin,
  authorize,
  checkPermission
};
