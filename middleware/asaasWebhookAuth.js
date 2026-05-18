// middleware/asaasWebhookAuth.js
//
// Validates incoming ASAAS webhook requests. ASAAS authenticates webhook
// callers via the `asaas-access-token` header (a static token the user
// configures in their ASAAS dashboard, which must match the value we store
// in `ASAAS_WEBHOOK_SECRET`).
//
// Behaviour:
//   - If `ASAAS_WEBHOOK_SECRET` is unset and NODE_ENV !== 'production',
//     the middleware logs a warning and lets the request through (so
//     contributors can test locally without configuring ASAAS).
//   - In production, missing/invalid token → 401 with no detail.
//   - Comparison is constant-time to avoid leaking the secret via timing.

const crypto = require('crypto');
const logger = require('../utils/logger');

function constantTimeEquals(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function asaasWebhookAuth(req, res, next) {
    const expected = process.env.ASAAS_WEBHOOK_SECRET;
    const provided = req.get('asaas-access-token') || req.get('Asaas-Access-Token');
    const isProduction = process.env.NODE_ENV === 'production';

    if (!expected) {
        if (isProduction) {
            logger.error('[asaasWebhookAuth] ASAAS_WEBHOOK_SECRET not configured in production', {
                requestId: req.id,
            });
            return res.status(503).json({ success: false, error: 'webhook_not_configured' });
        }
        logger.warn('[asaasWebhookAuth] ASAAS_WEBHOOK_SECRET unset; accepting without verification (dev only)', {
            requestId: req.id,
        });
        return next();
    }

    if (!provided || !constantTimeEquals(provided, expected)) {
        logger.warn('[asaasWebhookAuth] rejected webhook with invalid/missing token', {
            requestId: req.id,
            ip: req.ip,
            hasToken: Boolean(provided),
        });
        // Always respond identically so attackers can't distinguish "no token" from "bad token".
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    next();
}

module.exports = asaasWebhookAuth;
