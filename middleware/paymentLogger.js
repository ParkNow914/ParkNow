const logger = require('../utils/logger');

/**
 * Middleware para registrar operações de pagamento
 * @param {Object} req - Requisição HTTP
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 */
const paymentLogger = (req, res, next) => {
  // Salva a função original de enviar resposta
  const originalSend = res.send;
  
  // Captura o início da requisição
  const startTime = Date.now();
  
  // Log da requisição de entrada
  logger.info('Requisição de pagamento recebida', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user ? req.user.id : 'anonymous',
    body: req.method === 'POST' ? req.body : {},
    query: req.query,
    params: req.params
  });
  
  // Intercepta a resposta para registrar os dados
  res.send = function (body) {
    // Tempo de processamento
    const responseTime = Date.now() - startTime;
    
    // Tenta converter o corpo da resposta para objeto, se for JSON
    let responseBody = body;
    try {
      if (typeof body === 'string') {
        responseBody = JSON.parse(body);
      }
    } catch (e) {
      // Se não for JSON válido, mantém como está
    }
    
    // Log da resposta
    logger.info('Resposta de pagamento enviada', {
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user ? req.user.id : 'anonymous',
      paymentId: responseBody.data?.id || req.params.id,
      status: responseBody.data?.status,
      success: responseBody.success
    });
    
    // Chama a função original de envio
    return originalSend.call(this, body);
  };
  
  // Registra erros
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Erro na requisição de pagamento', {
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userId: req.user ? req.user.id : 'anonymous',
        body: req.method === 'POST' ? req.body : {},
        query: req.query,
        params: req.params
      });
    }
  });
  
  // Chama o próximo middleware
  next();
};

/**
 * Middleware para registrar webhooks de pagamento
 * @param {Object} req - Requisição HTTP
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 */
const webhookLogger = (req, res, next) => {
  // Salva a função original de enviar resposta
  const originalSend = res.send;
  
  // Captura o início da requisição
  const startTime = Date.now();
  
  // Log do webhook recebido
  logger.info('Webhook recebido', {
    type: req.body?.type,
    action: req.body?.action,
    data_id: req.body?.data?.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Intercepta a resposta para registrar os dados
  res.send = function (body) {
    // Tempo de processamento
    const responseTime = Date.now() - startTime;
    
    // Log da resposta do webhook
    logger.info('Resposta do webhook', {
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      data_id: req.body?.data?.id,
      status: req.body?.action
    });
    
    // Chama a função original de envio
    return originalSend.call(this, body);
  };
  
  // Registra erros
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Erro ao processar webhook', {
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        type: req.body?.type,
        action: req.body?.action,
        data_id: req.body?.data?.id,
        ip: req.ip
      });
    }
  });
  
  // Chama o próximo middleware
  next();
};

module.exports = {
  paymentLogger,
  webhookLogger
};
