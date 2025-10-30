const db = require('../models');
const { AppError, ForbiddenError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Middleware para verificar se o usuário autenticado é administrador do estacionamento
 * Deve ser usado após o middleware de autenticação
 */
const checkUserIsEstacionamentoAdmin = async (req, res, next) => {
  const { estacionamentoId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    logger.warn('Tentativa de acessar recurso de estacionamento sem autenticação');
    return next(new AppError('Usuário não autenticado', 401));
  }

  if (!estacionamentoId) {
    logger.warn('ID do estacionamento não fornecido na requisição');
    return next(new AppError('ID do estacionamento é obrigatório', 400));
  }

  try {
    // Verificar se o estacionamento existe e se o usuário é o administrador
    const estacionamento = await db.Estacionamento.findOne({
      where: {
        id: estacionamentoId,
        admin_id: userId
      },
      attributes: ['id'] // Apenas o ID é necessário
    });

    if (!estacionamento) {
      logger.warn(`Acesso negado: Usuário ${userId} não é administrador do estacionamento ${estacionamentoId}`);
      return next(new ForbiddenError('Acesso negado: você não tem permissão para acessar este recurso'));
    }

    // Adicionar o ID do estacionamento ao objeto de requisição para uso posterior
    req.estacionamentoId = estacionamentoId;
    
    logger.debug(`Permissão concedida: Usuário ${userId} é administrador do estacionamento ${estacionamentoId}`);
    next();
    
  } catch (error) {
    logger.error('Erro ao verificar permissões de administrador de estacionamento:', {
      error: error.message,
      stack: error.stack,
      estacionamentoId,
      userId
    });
    next(new AppError('Erro ao verificar permissões', 500));
  }
};

module.exports = {
  checkUserIsEstacionamentoAdmin
};
