const express = require('express');
const router = express.Router();

// Log all webhook requests
router.use((req, res, next) => {
    console.log(`[Webhook] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
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
router.post('/pix', (req, res) => {
    console.log('PIX webhook received:', req.body);
    // Process PIX webhook here
    res.status(200).json({ status: 'received' });
});

// Generic payment webhook endpoint
router.post('/payments', (req, res) => {
    console.log('Payment webhook received:', req.body);
    // Process payment webhook here
    res.status(200).json({ status: 'received' });
});

// Export the router
module.exports = router;
