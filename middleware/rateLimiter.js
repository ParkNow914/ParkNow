const rateLimit = require('express-rate-limit');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../utils/logger');

// Configuração básica para o rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por janela
  standardHeaders: true, // Retorna informações de limite no cabeçalho
  legacyHeaders: false, // Desabilita os cabeçalhos X-RateLimit-*
  message: 'Muitas requisições deste IP, tente novamente mais tarde.',
  handler: (req, res, next, options) => {
    logger.warn('Limite de taxa excedido', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      user: req.user ? req.user.id : 'anonymous'
    });
    res.status(options.statusCode).json({ 
      success: false, 
      message: options.message 
    });
  }
});

// Rate limiting mais restritivo para pagamentos
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Apenas 10 tentativas por hora
  message: 'Muitas tentativas de pagamento. Por favor, tente novamente mais tarde.',
  skipSuccessfulRequests: true, // Não contar requisições bem-sucedidas
  handler: (req, res, next, options) => {
    logger.warn('Limite de tentativas de pagamento excedido', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      user: req.user ? req.user.id : 'anonymous'
    });
    res.status(options.statusCode).json({ 
      success: false, 
      message: options.message 
    });
  }
});

// Rate limiting para endpoints públicos (login, registro, etc.)
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // 200 requisições por janela
  message: 'Muitas requisições deste IP, tente novamente mais tarde.'
});

// Rate limiting flexível para situações mais complexas
const flexibleRateLimiter = new RateLimiterMemory({
  points: 5, // Número de pontos
  duration: 1, // Por segundo
  blockDuration: 60 * 5, // Bloqueia por 5 minutos se o limite for excedido
  keyPrefix: 'rl_flex' // Prefixo para armazenamento
});

// Middleware para rate limiting flexível
const flexibleLimiter = (req, res, next) => {
  const key = req.user ? `user_${req.user.id}` : `ip_${req.ip}`;
  
  flexibleRateLimiter.consume(key, 1)
    .then(() => {
      next();
    })
    .catch(() => {
      logger.warn('Limite de taxa flexível excedido', {
        key,
        url: req.originalUrl,
        method: req.method
      });
      
      res.status(429).json({
        success: false,
        message: 'Muitas requisições. Por favor, diminua a velocidade.'
      });
    });
};

// Middleware para verificar se o usuário está autenticado
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Não autorizado. Por favor, faça login.'
    });
  }
  next();
};

// Middleware para verificar se o usuário é admin
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Acesso negado. Você não tem permissão para acessar este recurso.'
    });
  }
  next();
};

// Rate limiting para endpoints de aprovação de parcerias
const partnerApprovalLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 horas
  max: 10, // Máximo de 10 tentativas por dia por IP
  message: 'Muitas tentativas de aprovação deste IP. Tente novamente amanhã.',
  skipSuccessfulRequests: true, // Não contar tentativas bem-sucedidas
  handler: (req, res, next, options) => {
    logger.warn('Limite de tentativas de aprovação excedido', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      token: req.params.token ? 'present' : 'missing'
    });
    res.status(options.statusCode).json({ 
      success: false, 
      message: options.message,
      error: 'RATE_LIMIT_EXCEEDED',
      retryAfter: '24h'
    });
  }
});

module.exports = {
  apiLimiter,
  paymentLimiter,
  publicApiLimiter,
  flexibleLimiter,
  requireAuth,
  requireAdmin,
  partnerApprovalLimiter
};
