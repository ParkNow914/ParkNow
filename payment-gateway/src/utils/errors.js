/**
 * Classe base para erros personalizados da aplicação
 */
class AppError extends Error {
  /**
   * Cria uma nova instância de AppError
   * @param {string} message - Mensagem de erro
   * @param {number} statusCode - Código de status HTTP
   * @param {string} code - Código de erro personalizado (opcional)
   * @param {Object} details - Detalhes adicionais do erro (opcional)
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Indica se o erro é operacional (esperado) ou um bug
    
    // Captura o stack trace, excluindo o construtor da classe de erro
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erro para recursos não encontrados (404)
 */
class NotFoundError extends AppError {
  constructor(resource, id) {
    const message = id 
      ? `${resource} com ID ${id} não encontrado`
      : `${resource} não encontrado`;
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Erro para requisições inválidas (400)
 */
class BadRequestError extends AppError {
  constructor(message = 'Requisição inválida', details = {}) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * Erro para validação de dados (400)
 */
class ValidationError extends AppError {
  /**
   * @param {string|Array} errors - Erros de validação (pode ser uma mensagem ou array de erros)
   * @param {string} message - Mensagem de erro personalizada (opcional)
   */
  constructor(errors, message = 'Erro de validação') {
    const details = Array.isArray(errors) ? { errors } : { message: errors };
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Erro para autenticação falha (401)
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Erro para acesso negado (403)
 */
class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Erro para conflitos (409)
 */
class ConflictError extends AppError {
  constructor(resource, field, value) {
    const message = `${resource} com ${field} '${value}' já existe`;
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Erro para limite de taxa excedido (429)
 */
class RateLimitError extends AppError {
  constructor(message = 'Limite de taxa excedido') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Erro para serviços externos indisponíveis (503)
 */
class ServiceUnavailableError extends AppError {
  constructor(service, message = 'Serviço indisponível') {
    const fullMessage = service ? `${service}: ${message}` : message;
    super(fullMessage, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Erro para pagamentos
 */
class PaymentError extends AppError {
  /**
   * @param {string} message - Mensagem de erro
   * @param {string} code - Código de erro do gateway de pagamento
   * @param {Object} details - Detalhes adicionais do erro
   */
  constructor(message, code = 'PAYMENT_ERROR', details = {}) {
    super(message, 400, code, details);
  }
}

/**
 * Middleware para tratamento de erros
 */
const errorHandler = (err, req, res, next) => {
  // Definir valores padrão para erros não tratados
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Erro interno do servidor';
  let details = err.details || {};
  
  // Log do erro para depuração
  console.error(`[${new Date().toISOString()}] Erro:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    statusCode: err.statusCode,
    code: err.code,
    details: err.details,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? { id: req.user.id, email: req.user.email } : undefined
  });
  
  // Tratamento específico para erros do Mongoose/MongoDB
  if (err.name === 'CastError') {
    const message = `Formato de ID inválido: ${err.value}`;
    statusCode = 400;
    errorCode = 'INVALID_ID_FORMAT';
    details = { path: err.path, value: err.value };
  } else if (err.name === 'ValidationError') {
    // Erros de validação do Mongoose
    const errors = Object.values(err.errors).map(el => ({
      field: el.path,
      message: el.message,
      value: el.value
    }));
    
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Erro de validação';
    details = { errors };
  } else if (err.code === 11000) {
    // Erro de chave duplicada do MongoDB
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    statusCode = 409;
    errorCode = 'DUPLICATE_KEY';
    message = `Já existe um registro com ${field}: ${value}`;
    details = { field, value };
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Token de autenticação inválido';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Token expirado';
  }
  
  // Resposta de erro formatada
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(Object.keys(details).length > 0 && { details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  // Classes de erro
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  PaymentError,
  
  // Middleware
  errorHandler
};
