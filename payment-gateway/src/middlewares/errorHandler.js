const logger = require('../utils/logger');

/**
 * Classe de erro personalizado
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware para tratamento de erros
 */
const errorHandler = (err, req, res, next) => {
  // Se o erro não tiver um statusCode, define como 500 (erro interno do servidor)
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log detalhado em ambiente de desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    logger.error('Erro:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params
    });
  } else {
    // Em produção, registre apenas informações essenciais
    logger.error(`[${err.statusCode}] ${err.message} - ${req.method} ${req.originalUrl}`, {
      error: err.message,
      statusCode: err.statusCode,
      path: req.path
    });
  }

  // Se for um erro de validação, retorne os detalhes
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    return res.status(400).json({
      status: 'fail',
      message: 'Erro de validação',
      errors
    });
  }

  // Se for um erro do JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Token inválido. Por favor, faça login novamente.'
    });
  }

  // Se for um erro de expiração do token
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'fail',
      message: 'Sua sessão expirou. Por favor, faça login novamente.'
    });
  }

  // Se for um erro de chave duplicada do MongoDB
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `O valor '${err.keyValue[field]}' já está em uso. Por favor, use outro valor.`;
    return res.status(400).json({
      status: 'fail',
      message
    });
  }

  // Se for um erro operacional confiável: envie mensagem ao cliente
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }

  // 1) Log do erro
  logger.error('ERRO 💥', err);

  // 2) Se for um erro de programação ou outro erro desconhecido, não vaze os detalhes do erro
  return res.status(500).json({
    status: 'error',
    message: 'Algo deu muito errado!'
  });
};

module.exports = {
  errorHandler,
  AppError
};
