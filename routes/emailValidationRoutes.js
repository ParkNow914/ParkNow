const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const domainCache = require('../services/domainCacheService');
const mxValidation = require('../services/mxValidationService');
const emailRateLimiter = require('../services/emailRateLimiter');
const domainAnalysis = require('../services/domainAnalysisService');
const { compressResponse } = require('../middleware/compression');

// Esquema de validação com Zod
const emailSchema = z.object({
  email: z.string().email(),
  options: z.object({
    allowDisposable: z.boolean().optional().default(false),
    allowFree: z.boolean().optional().default(true),
    validateMx: z.boolean().optional().default(true),
    validateSmtp: z.boolean().optional().default(false)
  }).optional()
});

// Middleware para validação de entrada
const validateInput = (req, res, next) => {
  try {
    const result = emailSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'invalid_input',
        message: 'Entrada inválida',
        details: result.error.format()
      });
    }
    
    // Normaliza o e-mail
    req.validated = {
      ...result.data,
      email: result.data.email.toLowerCase().trim(),
      domain: result.data.email.split('@')[1].toLowerCase()
    };
    
    next();
  } catch (error) {
    logger.error('Erro na validação de entrada:', error);
    next(error);
  }
};

// Rota para validação de e-mail único
router.post(
  '/validate',
  [
    // Validação básica com express-validator
    body('email').isEmail().normalizeEmail(),
    // Middleware de rate limiting personalizado
    emailRateLimiter.middleware(),
    // Validação de entrada com Zod
    validateInput,
    // Compressão de resposta
    compressResponse()
  ],
  async (req, res, _next) => {
    const requestId = req.headers['x-request-id'] || uuidv4();
    const startTime = process.hrtime();
    
    // Configura o logger para incluir o requestId em todas as mensagens
    const requestLogger = logger.child({ requestId });
    
    try {
      requestLogger.info('Iniciando validação de e-mail', {
        method: req.method,
        path: req.path,
        body: { ...req.body, email: req.body.email ? '[REDACTED]' : undefined },
        query: req.query,
        params: req.params,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      
      if (!req.validated) {
        requestLogger.error('Dados de validação ausentes');
        throw new Error('Dados de validação ausentes');
      }
      const { email, domain, options } = req.validated;
      
      logger.info('Iniciando validação de e-mail', {
        requestId,
        email: email.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => a + b.replace(/./g, '*') + c), // Ofusca parte do e-mail
        domain,
        options
      });
      
      // Verifica cache de domínio primeiro
      const cachedResult = domainCache.get(domain);
      if (cachedResult) {
        logger.debug('Cache hit para domínio', { requestId, domain });
        
        // Aplica regras de opções ao resultado em cache
        if ((!options.allowDisposable && cachedResult.isDisposable) ||
            (!options.allowFree && cachedResult.isFree)) {
          return sendResponse(res, {
            valid: false,
            reason: 'email_type_not_allowed',
            message: 'Tipo de e-mail não permitido',
            isDisposable: cachedResult.isDisposable,
            isFree: cachedResult.isFree,
            cached: true,
            requestId
          });
        }
        
        return sendResponse(res, {
          ...cachedResult,
          cached: true,
          requestId
        });
      }
      
      // Validação básica do domínio
      if (!domain || typeof domain !== 'string' || domain.trim() === '') {
        return sendResponse(res, {
          valid: false,
          reason: 'invalid_domain',
          message: 'Domínio de e-mail inválido',
          requestId
        });
      }
      
      // Análise do domínio
      let domainInfo;
      try {
        domainInfo = domainAnalysis.getDomainInfo(domain);
      } catch (error) {
        logger.error('Erro ao analisar domínio', { requestId, domain, error: error.message });
        return sendResponse(res, {
          valid: false,
          reason: 'domain_analysis_failed',
          message: 'Não foi possível analisar o domínio do e-mail',
          requestId
        });
      }
      
      // Verifica domínios bloqueados
      if (domainInfo.isDisposable && !options.allowDisposable) {
        return sendResponse(res, {
          valid: false,
          reason: 'disposable_email',
          message: 'E-mails descartáveis não são permitidos',
          isDisposable: true,
          domain: domainInfo.domain,
          requestId
        });
      }
      
      // Verifica domínios grátis
      if (domainInfo.isFree && !options.allowFree) {
        return sendResponse(res, {
          valid: false,
          reason: 'free_email_not_allowed',
          message: 'E-mails de serviços gratuitos não são permitidos',
          isFree: true,
          domain: domainInfo.domain,
          requestId
        });
      }
      
      // Validação MX se necessário
      if (options.validateMx) {
        try {
          const mxRecords = await mxValidation.validateMxRecords(domain);
          domainInfo.mxRecords = mxRecords.map(r => ({
            exchange: r.exchange,
            priority: r.priority
          }));
          
          // Adiciona flag indicando que o domínio tem registros MX válidos
          domainInfo.hasValidMx = true;
          
          logger.info('Validação MX bem-sucedida', { 
            requestId, 
            domain, 
            hasMxRecords: mxRecords.length > 0,
            mxCount: mxRecords.length 
          });
          
        } catch (error) {
          // Para erros de validação MX, apenas registra o aviso mas continua a validação
          logger.warn('Aviso na validação MX', { 
            requestId, 
            domain, 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
          
          // Marca que a validação MX falhou, mas não invalida o e-mail
          domainInfo.mxValidationFailed = true;
          domainInfo.mxError = error.message;
        }
      }
      
      // Prepara resultado para cache
      const result = {
        valid: true,
        message: 'E-mail válido',
        domain: domainInfo.domain,
        isDisposable: domainInfo.isDisposable,
        isFree: domainInfo.isFree,
        isSuspicious: domainInfo.isSuspicious,
        riskScore: domainInfo.riskScore,
        mxRecords: domainInfo.mxRecords,
        timestamp: new Date().toISOString()
      };
      
      // Armazena no cache
      domainCache.set(domain, result);
      
      // Envia resposta
      sendResponse(res, {
        ...result,
        cached: false,
        requestId
      });
      
    } catch (error) {
      const errorId = uuidv4();
      const errorDetails = {
        requestId,
        errorId,
        error: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        code: error.code,
        details: error.details,
        email: req.validated?.email ? '[REDACTED]' : undefined,
        domain: req.validated?.domain,
        ip: req.ip,
        userAgent: req.get('user-agent')
      };
      
      logger.error('Erro na validação de e-mail', errorDetails);
      
      // Se for um erro de validação, retorna 400
      if (error.name === 'ValidationError' || error.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'Erro de validação',
          details: error.errors || error.issues || error.message,
          requestId,
          errorId
        });
      }
      
      // Se for um erro de limite de taxa, retorna 429
      if (error.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'rate_limit_exceeded',
          message: 'Muitas requisições. Por favor, tente novamente mais tarde.',
          requestId,
          errorId,
          retryAfter: error.retryAfter
        });
      }
      
      // Para outros erros, retorna 500 com uma mensagem genérica
      const response = {
        success: false,
        error: 'internal_server_error',
        message: 'Ocorreu um erro interno no servidor',
        requestId,
        errorId
      };
      
      // Em desenvolvimento, inclui mais detalhes do erro
      if (process.env.NODE_ENV === 'development') {
        response.errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code
        };
      }
      
      res.status(500).json(response);
    } finally {
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = Math.round((seconds * 1e3) + (nanoseconds / 1e6));
      
      logger.info('Validação de e-mail concluída', {
        requestId,
        durationMs: duration,
        statusCode: res.statusCode
      });
    }
  }
);

// Rota para validação em lote
router.post(
  '/validate/batch',
  [
    body('emails').isArray({ min: 1, max: 100 }),
    body('emails.*').isEmail(),
    body('options').optional().isObject(),
    emailRateLimiter.middleware(),
    compressResponse()
  ],
  async (req, res) => {
    const { emails, options = {} } = req.body;
    const results = [];
    
    // Processa em paralelo com limitação de concorrência
    const concurrency = 5;
    const batches = [];
    
    for (let i = 0; i < emails.length; i += concurrency) {
      const batch = emails
        .slice(i, i + concurrency)
        .map(email => 
          validateEmail(email, options)
            .catch(error => ({
              email,
              valid: false,
              error: 'validation_error',
              message: error.message
            }))
        );
      
      batches.push(batch);
    }
    
    // Aguarda todos os batches
    for (const batch of batches) {
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    
    res.json({
      success: true,
      count: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      results
    });
  }
);

// Função auxiliar para validar um único e-mail (usada no batch)
async function validateEmail(email, options) {
  const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/email/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, options })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

// Função auxiliar para enviar respostas padronizadas
function sendResponse(res, data) {
  // Adiciona cabeçalhos de cache se aplicável
  if (data.cached) {
    res.set('X-Cache', 'HIT');
  } else {
    res.set('X-Cache', 'MISS');
  }
  
  // Envia a resposta
  res.json(data);
}

// Middleware de tratamento de erros
router.use((err, req, res, _next) => {
  const errorId = uuidv4();
  
  logger.error(`[${errorId}] Erro na rota de validação de e-mail`, {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    body: process.env.NODE_ENV === 'development' ? req.body : {},
    params: req.params
  });

  // Erros de validação
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'validation_error',
      message: 'Erro de validação',
      details: err.errors || err.issues || err.message,
      requestId: req.requestId,
      errorId
    });
  }

  // Erros de limite de taxa
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'rate_limit_exceeded',
      message: 'Muitas requisições. Por favor, tente novamente mais tarde.',
      requestId: req.requestId,
      errorId,
      retryAfter: err.retryAfter
    });
  }

  // Erros de domínio não permitido
  if (err.code === 'DOMAIN_NOT_ALLOWED') {
    return res.status(400).json({
      success: false,
      error: 'domain_not_allowed',
      message: 'O domínio do e-mail não é permitido',
      requestId: req.requestId,
      errorId,
      domain: err.domain
    });
  }

  // Erro genérico
  res.status(500).json({
    success: false,
    error: 'internal_server_error',
    message: 'Ocorreu um erro interno no servidor',
    requestId: req.requestId,
    errorId,
    ...(process.env.NODE_ENV === 'development' ? { 
      details: err.message,
      stack: err.stack 
    } : {})
  });
});

module.exports = router;
