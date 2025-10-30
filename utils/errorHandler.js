/**
 * Classe base para erros personalizados
 * @extends Error
 */
class AppError extends Error {
    /**
     * Cria uma instância de AppError
     * @param {string} message - Mensagem de erro
     * @param {number} statusCode - Código de status HTTP
     * @param {boolean} isOperational - Indica se o erro é operacional (true) ou programático (false)
     * @param {string} stack - Stack trace do erro
     */
    constructor(message, statusCode = 500, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Erro para recursos não encontrados (404)
 * @extends AppError
 */
class NotFoundError extends AppError {
    constructor(message = 'Recurso não encontrado') {
        super(message, 404);
    }
}

/**
 * Erro de validação (400)
 * @extends AppError
 */
class ValidationError extends AppError {
    constructor(message = 'Dados inválidos', errors = []) {
        super(message, 400);
        this.errors = errors;
    }
}

/**
 * Erro de autenticação (401)
 * @extends AppError
 */
class UnauthorizedError extends AppError {
    constructor(message = 'Não autorizado') {
        super(message, 401);
    }
}

/**
 * Erro de permissão (403)
 * @extends AppError
 */
class ForbiddenError extends AppError {
    constructor(message = 'Acesso negado') {
        super(message, 403);
    }
}

/**
 * Middleware para tratamento de erros global
 * @param {Error} err - Objeto de erro
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @param {Function} next - Próxima função de middleware
 */
const globalErrorHandler = (err, req, res, next) => {
    // Definir valores padrão para erros não tratados
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log do erro em produção
    if (process.env.NODE_ENV === 'production') {
        // Log apenas erros operacionais em produção
        if (err.isOperational) {
            console.error('Erro operacional:', err.message);
        } else {
            // Log detalhado para erros de programação
            console.error('ERRO! 💥', err);
        }
    } else if (process.env.NODE_ENV === 'development') {
        // Log detalhado em desenvolvimento
        console.error('Erro:', err);
    }

    // Enviar resposta de erro
    if (req.originalUrl.startsWith('/api')) {
        // Resposta para APIs
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message,
            error: process.env.NODE_ENV === 'development' ? err : undefined,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }

    // Renderizar página de erro para rotas de visualização
    res.status(err.statusCode).render('error', {
        title: 'Algo deu errado!',
        msg: err.message
    });
};

module.exports = {
    AppError,
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    globalErrorHandler
};
