const express = require('express');
const router = express.Router();

// Middleware para log de requisições
router.use((req, res, next) => {
    console.log(`[Webhook] Nova requisição: ${req.method} ${req.originalUrl}`);
    next();
});

// Rota de teste
router.get('/test', (req, res) => {
    res.json({
        message: 'Webhook está funcionando!',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

// Rota para webhook do PIX
router.post('/pix', (req, res) => {
    console.log('Webhook PIX recebido:', req.body);
    res.status(200).json({ received: true });
});

// Rota para webhook de pagamentos
router.post('/payments', (req, res) => {
    console.log('Webhook de pagamento recebido:', req.body);
    res.status(200).json({ received: true });
});

// Exporta o router configurado
module.exports = router;
