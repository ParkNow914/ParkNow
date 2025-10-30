/**
 * @fileoverview Módulo de gerenciamento de erros da aplicação.
 * 
 * Este módulo fornece a classe base `AppError` para erros operacionais personalizados,
 * além de métodos utilitários para criar e manipular erros de forma consistente.
 * 
 * @module utils/AppError
 * @version 2.0.0
 * @license MIT
 */

/**
 * Classe base para erros operacionais da aplicação.
 * 
 * Erros operacionais são erros esperados durante a execução normal da aplicação,
 * como validação de entrada, falhas de autenticação, recursos não encontrados, etc.
 * Eles são diferentes de erros de programação (bugs) e devem ser tratados de forma
 * específica no manipulador de erros global.
 * 
 * @example
 * // Criando um erro personalizado
 * throw new AppError('Usuário não encontrado', 404, 'USER_NOT_FOUND');
 * 
 * @example
 * // Usando métodos de conveniência
 * throw AppError.notFound('Usuário não encontrado');
 * throw AppError.validationError({ email: 'E-mail inválido' });
 * 
 * @example
 * // Convertendo erros de bibliotecas externas
 * try {
 *   // código que pode lançar um erro
 * } catch (error) {
 *   throw AppError.fromError(error, {
 *     message: 'Falha ao processar a requisição',
 *     statusCode: 400
 *   });
 * }
 * 
 * @class
 * @extends {Error}
 */
class AppError extends Error {
    /**
     * Cria uma instância de AppError.
     * @param {string} message - Mensagem de erro descritiva para o cliente ou log.
     * @param {number} statusCode - Código de status HTTP apropriado (4xx para cliente, 5xx para servidor).
     * @param {string} [code] - Código de erro personalizado para identificação programática.
     * @param {Object} [details] - Detalhes adicionais sobre o erro.
     * @param {boolean} [isOperational=true] - Indica se o erro é operacional (true) ou um bug (false).
     */
    constructor(message, statusCode, code, details, isOperational = true) {
        super(message); // Chama o construtor da classe Error pai
        
        // Define as propriedades padrão
        this.statusCode = statusCode;
        this.code = code || this.constructor.name.toUpperCase() || 'APP_ERROR';
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = isOperational;
        this.details = details || {};
        this.timestamp = new Date().toISOString();
        
        // Captura o stack trace da chamada original
        Error.captureStackTrace(this, this.constructor);
        
        // Adiciona informações adicionais para erros de banco de dados
        if (details?.sql) {
            this.details.sql = details.sql;
            this.details.parameters = details.parameters;
        }
        
        // Remove informações sensíveis em produção
        if (process.env.NODE_ENV === 'production') {
            if (this.details?.password) delete this.details.password;
            if (this.details?.senha) delete this.details.senha;
            if (this.details?.token) delete this.details.token;
            if (this.details?.refreshToken) delete this.details.refreshToken;
        }
    }
  
    /**
     * Serializa o erro para JSON, usado automaticamente pelo Express.
     * Remove propriedades sensíveis e formata a saída de forma consistente.
     * @returns {Object} Objeto com as propriedades do erro formatadas
     */
    toJSON() {
        // Cria uma cópia segura dos detalhes para não modificar o original
        const safeDetails = { ...this.details };
        
        // Remove informações sensíveis dos detalhes em produção
        if (process.env.NODE_ENV === 'production') {
            const sensitiveFields = ['password', 'senha', 'token', 'refreshToken', 'authorization'];
            sensitiveFields.forEach(field => {
                if (safeDetails[field]) delete safeDetails[field];
            });
            
            // Remove stack trace em produção, a menos que explicitamente solicitado
            if (safeDetails.stack) delete safeDetails.stack;
        }
        
        // Estrutura padrão de resposta de erro
        const response = {
            status: this.status,
            statusCode: this.statusCode,
            code: this.code,
            message: this.message,
            timestamp: this.timestamp,
            ...(Object.keys(safeDetails).length > 0 && { details: safeDetails })
        };
        
        // Adiciona stack trace apenas em desenvolvimento
        if (process.env.NODE_ENV === 'development' && this.stack) {
            response.stack = this.stack;
        }
        
        return response;
    }
    
    // ====================================
    // Métodos de conveniência estáticos
    // ====================================

    
    /**
     * Converte um erro genérico em uma instância de AppError.
     * Útil para converter erros de bibliotecas externas ou erros nativos do Node.js.
     * 
     * @param {Error} error - O erro original a ser convertido
     * @param {Object} [options] - Opções adicionais
     * @param {string} [options.message] - Mensagem de erro personalizada (opcional)
     * @param {number} [options.statusCode=500] - Código de status HTTP (padrão: 500)
     * @param {string} [options.code] - Código de erro personalizado (opcional)
     * @param {Object} [options.details] - Detalhes adicionais do erro (opcional)
     * @param {boolean} [options.isOperational=true] - Se o erro é operacional (padrão: true)
     * @returns {AppError} Nova instância de AppError
     */
    static fromError(error, options = {}) {
        // Se já for um AppError, retorna uma cópia
        if (error instanceof AppError) {
            return error;
        }
        
        // Configuração padrão
        const {
            message = error.message || 'Ocorreu um erro inesperado',
            statusCode = 500,
            code = 'INTERNAL_ERROR',
            details = {},
            isOperational = true
        } = options;
        
        // Adiciona informações adicionais de erros conhecidos
        const errorDetails = { ...details };
        
        // Tratamento para erros de banco de dados PostgreSQL
        if (error.code && error.code.startsWith('23') || error.code === '23505') {
            errorDetails.databaseCode = error.code;
            
            // Violação de restrição única (código 23505)
            if (error.code === '23505') {
                errorDetails.constraint = error.constraint;
                errorDetails.table = error.table;
                
                // Extrai o nome da coluna da mensagem de erro
                const columnMatch = error.detail && error.detail.match(/Key \(([^)]+)\)/);
                if (columnMatch && columnMatch[1]) {
                    errorDetails.column = columnMatch[1];
                }
                
                return new AppError(
                    'Um registro com este valor já existe.',
                    409,
                    'DUPLICATE_ENTRY',
                    errorDetails,
                    true
                );
            }
            
            // Outros erros de restrição
            if (error.code.startsWith('23')) {
                return new AppError(
                    'Violação de restrição no banco de dados.',
                    400,
                    'DATABASE_CONSTRAINT_VIOLATION',
                    errorDetails,
                    true
                );
            }
        }
        
        // Tratamento para erros de validação do Joi/celebrate
        if (error.details) {
            const validationErrors = {};
            
            if (Array.isArray(error.details)) {
                error.details.forEach(detail => {
                    const key = detail.path.join('.');
                    validationErrors[key] = {
                        message: detail.message,
                        type: detail.type,
                        context: detail.context
                    };
                });
                
                return AppError.validationError(
                    validationErrors,
                    'Erro de validação nos dados fornecidos.'
                );
            }
        }
        
        // Tratamento para erros de rede/requisição HTTP
        if (error.isAxiosError) {
            const axiosError = error;
            const responseData = axiosError.response?.data || {};
            
            return new AppError(
                responseData.message || 'Erro na comunicação com serviço externo',
                axiosError.response?.status || 502,
                'EXTERNAL_SERVICE_ERROR',
                {
                    ...errorDetails,
                    service: axiosError.config?.url ? new URL(axiosError.config.url).hostname : 'unknown',
                    status: axiosError.response?.status,
                    response: responseData
                },
                true
            );
        }
        
        // Para outros tipos de erro, retorna um AppError genérico
        return new AppError(
            message,
            statusCode,
            code,
            {
                ...errorDetails,
                originalError: {
                    name: error.name,
                    message: error.message,
                    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
            },
            isOperational
        );
    }

    /**
     * Cria um erro de recurso não encontrado (404)
     * @param {string} [message='Recurso não encontrado'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para recurso não encontrado
     */
    static notFound(message = 'Recurso não encontrado', details = {}) {
        return new AppError(message, 404, 'NOT_FOUND', details, true);
    }
    
    /**
     * Cria um erro de entrada inválida (400)
     * @param {string} [message='Dados de entrada inválidos'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para entrada inválida
     */
    static badRequest(message = 'Dados de entrada inválidos', details = {}) {
        return new AppError(message, 400, 'BAD_REQUEST', details, true);
    }
    
    /**
     * Cria um erro de autenticação (401)
     * @param {string} [message='Não autorizado'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para autenticação
     */
    static unauthorized(message = 'Não autorizado', details = {}) {
        return new AppError(message, 401, 'UNAUTHORIZED', details, true);
    }
    
    /**
     * Cria um erro de permissão negada (403)
     * @param {string} [message='Acesso negado'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para permissão negada
     */
    static forbidden(message = 'Acesso negado', details = {}) {
        return new AppError(message, 403, 'FORBIDDEN', details, true);
    }
    
    /**
     * Cria um erro de validação (422)
     * @param {Array|Object} errors - Erros de validação (pode ser array ou objeto)
     * @param {string} [message='Erro de validação'] - Mensagem de erro
     * @returns {AppError} Nova instância de AppError para validação
     */
    static validationError(errors, message = 'Erro de validação') {
        const errorsArray = Array.isArray(errors) ? errors : [errors];
        return new AppError(
            message, 
            422, 
            'VALIDATION_ERROR', 
            { errors: errorsArray },
            true
        );
    }
    
    /**
     * Cria um erro de conflito (409)
     * @param {string} [message='Conflito de recurso'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para conflito
     */
    static conflict(message = 'Conflito de recurso', details = {}) {
        return new AppError(message, 409, 'CONFLICT', details, true);
    }
    
    /**
     * Cria um erro de limite de taxa excedido (429)
     * @param {string} [message='Muitas requisições'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para limite de taxa excedido
     */
    static tooManyRequests(message = 'Muitas requisições', details = {}) {
        return new AppError(message, 429, 'TOO_MANY_REQUESTS', details, true);
    }
    
    /**
     * Cria um erro de serviço indisponível (503)
     * @param {string} [message='Serviço temporariamente indisponível'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para serviço indisponível
     */
    static serviceUnavailable(message = 'Serviço temporariamente indisponível', details = {}) {
        return new AppError(message, 503, 'SERVICE_UNAVAILABLE', details, true);
    }
    
    /**
     * Cria um erro de gateway time-out (504)
     * @param {string} [message='Tempo limite da requisição excedido'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para tempo limite excedido
     */
    static timeout(message = 'Tempo limite da requisição excedido', details = {}) {
        return new AppError(message, 504, 'GATEWAY_TIMEOUT', details, true);
    }
    
    /**
     * Cria um erro de integração com serviço externo (502)
     * @param {Error} error - Erro original
     * @param {string} serviceName - Nome do serviço externo
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para erro de integração
     */
    static integrationError(error, serviceName, details = {}) {
        return new AppError(
            `Erro ao se comunicar com ${serviceName}: ${error.message}`,
            502,
            'INTEGRATION_ERROR',
            { ...details, originalError: error.message },
            true
        );
    }
    
    /**
     * Cria um erro genérico de servidor (500)
     * @param {Error} error - Erro original
     * @param {string} [message='Erro interno do servidor'] - Mensagem de erro
     * @param {Object} [details] - Detalhes adicionais
     * @returns {AppError} Nova instância de AppError para erro interno do servidor
     */
    static internalServerError(error, message = 'Erro interno do servidor', details = {}) {
        return new AppError(
            message,
            500,
            'INTERNAL_SERVER_ERROR',
            { 
                ...details, 
                originalError: process.env.NODE_ENV === 'development' ? error.message : undefined,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            false // Não é um erro operacional (é um bug)
        );
    }
  }
  
  // --- Erros Específicos (Compatibilidade com código existente) ---
  
  /** 
   * @deprecated Use AppError.notFound() em vez disso
   * Erro para recursos não encontrados (404 Not Found). 
   */
  class NotFoundError extends AppError {
      constructor(message = 'Recurso não encontrado.') {
          super(message, 404, 'NOT_FOUND');
      }
  }
  
  /** 
   * @deprecated Use AppError.invalidInput() ou AppError com status 400
   * Erro para requisições inválidas ou dados faltando (400 Bad Request). 
   */
  class BadRequestError extends AppError {
      constructor(message = 'Requisição inválida.', details) {
          super(message, 400, 'BAD_REQUEST', details || {});
      }
  }
  
  /** 
   * @deprecated Use AppError.unauthorized() em vez disso
   * Erro para falha na autenticação (token inválido, expirado, etc.) (401 Unauthorized). 
   */
  class AuthenticationError extends AppError {
      constructor(message = 'Autenticação necessária ou falhou.') {
          super(message, 401, 'UNAUTHORIZED');
      }
  }
  
  /** 
   * @deprecated Use AppError.forbidden() em vez disso
   * Erro para falta de permissão (usuário autenticado mas sem acesso) (403 Forbidden). 
   */
  class AuthorizationError extends AppError {
      constructor(message = 'Acesso não autorizado a este recurso.') {
          super(message, 403, 'FORBIDDEN');
      }
  }
  
  /** 
   * @deprecated Use AppError.validationError() em vez disso
   * Erro específico para falhas de validação de dados (422 Unprocessable Entity). 
   */
  class ValidationError extends AppError {
      constructor(errors, message = 'Erro de validação nos dados enviados.') {
          super(message, 422, 'VALIDATION_ERROR', { errors });
      }
  }
  
  /** 
   * @deprecated Use AppError.conflict() em vez disso
   * Erro para conflito de recursos (ex: email já existe) (409 Conflict). 
   */
  class ConflictError extends AppError {
      constructor(message = 'Conflito de recurso.') {
          super(message, 409, 'CONFLICT');
      }
  }
  
  // ====================================
  // Exemplos de Uso
  // ====================================
  
  /**
   * @example
   * // Exemplo 1: Lançando erros personalizados
   * if (!user) {
   *   throw AppError.notFound('Usuário não encontrado', { userId: 123 });
   * }
   * 
   * @example
   * // Exemplo 2: Tratando erros de validação
   * const { error } = schema.validate(req.body);
   * if (error) {
   *   throw AppError.validationError(error.details, 'Dados inválidos fornecidos');
   * }
   * 
   * @example
   * // Exemplo 3: Convertendo erros de banco de dados
   * try {
   *   await User.create({ email: 'existing@example.com' });
   * } catch (error) {
   *   throw AppError.fromError(error, {
   *     message: 'Falha ao criar usuário',
   *     statusCode: 400
   *   });
   * }
   * 
   * @example
   * // Exemplo 4: Erro de serviço externo
   * try {
   *   await axios.get('https://api.exemplo.com/dados');
   * } catch (error) {
   *   throw AppError.integrationError(error, 'Serviço de Pagamento');
   * }
   */
  
  // ====================================
  // Exportação
  // ====================================
  
  // Exporta as classes de erro para uso na aplicação
  module.exports = {
      AppError,
      NotFoundError,
      BadRequestError,
      AuthenticationError,
      AuthorizationError,
      ValidationError,
      ConflictError
  };
  
  /**
   * @typedef {Object} ErrorResponse
   * @property {string} status - Status do erro ('fail' para 4xx, 'error' para 5xx)
   * @property {number} statusCode - Código de status HTTP
   * @property {string} code - Código de erro personalizado
   * @property {string} message - Mensagem de erro descritiva
   * @property {string} timestamp - Timestamp ISO do erro
   * @property {Object} [details] - Detalhes adicionais do erro
   * @property {string} [stack] - Stack trace (apenas em desenvolvimento)
   */