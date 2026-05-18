const crypto = require('crypto');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const config = require('../config');

class WebhookController {
    // Processa notificações de webhook do PIX
    async handlePixWebhook(req, res, _next) {
        try {
            const signature = req.headers['x-webhook-signature'] || req.headers['x-signature'];
            const payload = JSON.stringify(req.body);
            
            // Valida a assinatura do webhook (se configurado)
            if (config.pix.validateWebhookSignature) {
                const isValid = this.verifyWebhookSignature(payload, signature, config.pix.webhookSecret);
                if (!isValid) {
                    logger.warn('Assinatura de webhook inválida:', { signature, payload });
                    return res.status(401).json({ success: false, error: 'Assinatura inválida' });
                }
            }
            
            // Log do webhook recebido para depuração
            logger.info('Webhook PIX recebido:', { 
                evento: req.body.evento || 'unknown', 
                payload: req.body 
            });
            
            // Processa o pagamento usando o serviço
            const resultado = await paymentService.processarNotificacaoPagamento(req.body);
            
            res.status(200).json({ 
                success: true,
                data: resultado
            });
            
        } catch (error) {
            logger.error('Erro ao processar webhook PIX:', {
                error: error.message,
                stack: error.stack,
                body: req.body,
                headers: req.headers
            });
            
            // Responde com erro para o provedor de pagamento tentar novamente
            res.status(500).json({ 
                success: false, 
                error: 'Erro ao processar notificação',
                message: error.message
            });
        }
    }
    
    // Verifica a assinatura do webhook
    verifyWebhookSignature(payload, signature, secret) {
        if (!signature || !secret) {
            logger.warn('Assinatura ou segredo não fornecidos para validação do webhook');
            return false;
        }
        
        try {
            const hmac = crypto.createHmac('sha256', secret);
            const digest = 'sha256=' + hmac.update(payload).digest('hex');
            
            // Comparação segura contra ataques de tempo
            const isValid = crypto.timingSafeEqual(
                Buffer.from(digest, 'utf-8'),
                Buffer.from(signature, 'utf-8')
            );
            
            if (!isValid) {
                logger.warn('Assinatura de webhook inválida', {
                    digest,
                    signature,
                    payload: payload.length > 500 ? `${payload.substring(0, 500)}...` : payload
                });
            }
            
            return isValid;
            
        } catch (error) {
            logger.error('Erro ao verificar assinatura do webhook:', {
                error: error.message,
                stack: error.stack,
                signatureLength: signature?.length,
                secretLength: secret?.length
            });
            return false;
        }
    }
}

module.exports = new WebhookController();
