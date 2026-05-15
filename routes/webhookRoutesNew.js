const express = require('express');
const logger = require('../utils/logger');
const auditLog = require('../middleware/auditLog');

const router = express.Router();

// Log all webhook requests
router.use((req, res, next) => {
    logger.info('[webhook]', { method: req.method, path: req.originalUrl, requestId: req.id });
    next();
});

// Test route
router.get('/test', (req, res) => {
    res.json({
        status: 'success',
        message: 'Webhook endpoint is working!',
        timestamp: new Date().toISOString()
    });
});

// PIX webhook endpoint
router.post('/pix', auditLog('webhook.pix'), (req, res) => {
    logger.info('PIX webhook received', { requestId: req.id });
    // Process PIX webhook here
    res.status(200).json({ status: 'received' });
});

// Generic payment webhook endpoint
router.post('/payments', auditLog('webhook.payments'), (req, res) => {
    logger.info('Payment webhook received', { requestId: req.id });
    // Process payment webhook here
    res.status(200).json({ status: 'received' });
});

// Export the router
module.exports = router;
