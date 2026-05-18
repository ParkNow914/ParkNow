// middleware/errorMiddleware.js
// Middleware para tratamento global de erros na aplicação Express.

const logger = require('../utils/logger'); // Importa o logger Winston
const { AppError: _AppError } = require('../utils/AppError'); // Importa a classe base de erro customizado

/**
 * Middleware de tratamento de erros. Captura erros passados por next(error).
 * @param {Error|AppError} err - O objeto de erro.
 * @param {object} req - Objeto da requisição Express.
 * @param {object} res - Objeto da resposta Express.
 * @param {function} next - Função next (geralmente não usada aqui).
 */
const errorHandler = (err, req, res, _next) => {
    // Define statusCode e status padrão
    err.statusCode = err.statusCode || 500;
    err.status = err.status || (err.statusCode >= 500 ? 'error' : 'fail');

    // Define a mensagem de erro a ser enviada ao cliente
    let message = err.message || 'Erro interno do servidor';
    let errorCode = err.code || 'UNKNOWN_ERROR';
    let errorDetails = {};

    // Tratamento específico para erros de banco de dados PostgreSQL
    if (err.code) {
        // Erro de violação de restrição única (ex: duplicação de chave)
        if (err.code === '23505') {
            err.statusCode = 409; // Conflict
            message = 'Já existe um registro com os mesmos dados. Por favor, verifique as informações.';
            errorCode = 'DUPLICATE_ENTRY';
            errorDetails.constraint = err.constraint;
            errorDetails.table = err.table;
        }
        // Erro de violação de chave estrangeira
        else if (err.code === '23503') {
            err.statusCode = 400; // Bad Request
            message = 'Referência inválida. Um ou mais registros relacionados não foram encontrados.';
            errorCode = 'FOREIGN_KEY_VIOLATION';
            errorDetails.constraint = err.constraint;
            errorDetails.table = err.table;
        }
        // Erro de violação de restrição de não nulo
        else if (err.code === '23502') {
            err.statusCode = 400; // Bad Request
            message = 'Campo obrigatório não informado.';
            errorCode = 'NOT_NULL_VIOLATION';
            errorDetails.column = err.column;
            errorDetails.table = err.table;
        }
        // Timeout da conexão com o banco
        else if (err.code === '57014') {
            err.statusCode = 504; // Gateway Timeout
            message = 'Tempo limite de conexão com o banco de dados excedido.';
            errorCode = 'DB_CONNECTION_TIMEOUT';
        }
    }

    // Tratamento para erros de gateway de pagamento
    if (err.name === 'PaymentGatewayError') {
        // Mapeia códigos de erro comuns do gateway para mensagens mais amigáveis
        const gatewayErrors = {
            'invalid_parameter': 'Parâmetro inválido na requisição para o gateway de pagamento.',
            'not_found': 'Recurso não encontrado no gateway de pagamento.',
            'unauthorized': 'Não autorizado a acessar o gateway de pagamento.',
            'payment_required': 'Pagamento necessário para acessar este recurso.',
            'forbidden': 'Acesso negado ao recurso do gateway de pagamento.',
            'bad_request': 'Requisição inválida para o gateway de pagamento.',
            'internal_server_error': 'Erro interno no gateway de pagamento.'
        };
        
        message = gatewayErrors[err.code] || message;
        errorCode = `GATEWAY_${err.code || 'UNKNOWN_ERROR'}`;
        errorDetails.gateway_error = err.message;
        errorDetails.gateway_status = err.status;
        errorDetails.gateway_cause = err.cause;
    }

    // Log detalhado do erro usando Winston
    const logData = {
        // Metadados da requisição
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        user: req.user ? { id: req.user.id, email: req.user.email } : 'guest',
        
        // Detalhes do erro
        statusCode: err.statusCode,
        errorCode: errorCode,
        message: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
        isOperational: err.isOperational,
        
        // Dados adicionais
        body: req.body,
        query: req.query,
        params: req.params,
        
        // Detalhes específicos de erro
        ...errorDetails,
        
        // Erros de validação
        validationErrors: err.errors
    };

    // Remove campos sensíveis do log em produção
    if (process.env.NODE_ENV === 'production') {
        if (logData.body?.senha) delete logData.body.senha;
        if (logData.body?.password) delete logData.body.password;
        if (logData.body?.token) delete logData.body.token;
        if (logData.body?.refreshToken) delete logData.body.refreshToken;
    }

    // Log do erro
    if (err.statusCode >= 500) {
        logger.error(`${err.statusCode} - ${message}`, logData);
    } else if (err.statusCode >= 400) {
        logger.warn(`${err.statusCode} - ${message}`, logData);
    } else {
        logger.info(`${err.statusCode} - ${message}`, logData);
    }

    // Prepara a resposta para o cliente
    const response = {
        status: err.status,
        message: message,
        code: errorCode,
        ...(Object.keys(errorDetails).length > 0 && { details: errorDetails })
    };

    // Em produção, limpa detalhes sensíveis
    if (process.env.NODE_ENV === 'production') {
        // Se for um erro operacional (AppError) e não um erro 500 genérico, envia a mensagem definida
        if (err.isOperational && err.statusCode < 500) {
            return res.status(err.statusCode).json({
                status: err.status,
                message: response.message,
                code: response.code,
                // Envia erros de validação específicos se existirem (ex: status 422)
                ...(err.errors && { errors: err.errors })
            });
        }
        
        // Para erros 500 ou erros não operacionais, retorna uma mensagem genérica
        return res.status(500).json({
            status: 'error',
            message: 'Ocorreu um erro inesperado no servidor. Por favor, tente novamente mais tarde.',
            code: 'INTERNAL_SERVER_ERROR'
        });
    } else {
        // Em desenvolvimento, envia uma resposta detalhada
        return res.status(err.statusCode).json({
            ...response,
            error: {
                name: err.name,
                message: err.message, // Mensagem original
                statusCode: err.statusCode,
                isOperational: err.isOperational,
                errors: err.errors,
                stack: err.stack
            },
            // Inclui detalhes adicionais para depuração
            request: {
                method: req.method,
                url: req.originalUrl,
                body: req.body,
                query: req.query,
                params: req.params,
                user: req.user ? { id: req.user.id, email: req.user.email } : null
            }
        });
    }
};

module.exports = errorHandler;