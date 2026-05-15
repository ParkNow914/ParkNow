// middleware/originCheck.js
//
// Lightweight CSRF mitigation for cookie-authenticated routes.
//
// The ParkNow API uses bearer tokens for normal protected routes, but the
// refresh-token / logout endpoints rely on an httpOnly cookie. For those
// routes we enforce that the request's Origin or Referer header matches one
// of the configured allowed origins. Browsers send these headers for every
// cross-site request and they cannot be forged from JS in another origin,
// so this blocks classic CSRF without requiring a CSRF token.
//
// `config.frontendUrl` already accepts a comma-separated list of allowed
// origins; we reuse it here. Same-origin requests (no Origin/Referer or one
// matching the request host) are also allowed for tools like cURL / server
// health probes in dev — but only outside production.

const { URL } = require('url');
const logger = require('../utils/logger');
const config = require('../config');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseOrigin(value) {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch (_e) {
        return null;
    }
}

function buildAllowedOrigins() {
    const raw = config.frontendUrl || '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(parseOrigin)
        .filter(Boolean);
}

/**
 * Build the middleware once at startup; the allowed-origins list is cached.
 * Set `options.allowMissingInDev` (default true) to permit requests with no
 * Origin/Referer in non-production (useful for curl during local dev).
 */
function originCheck(options = {}) {
    const { allowMissingInDev = true } = options;
    const allowedOrigins = buildAllowedOrigins();
    const isProduction = process.env.NODE_ENV === 'production';

    return function originCheckMiddleware(req, res, next) {
        if (SAFE_METHODS.has(req.method)) {
            return next();
        }

        const origin = parseOrigin(req.get('Origin')) || parseOrigin(req.get('Referer'));

        if (!origin) {
            if (!isProduction && allowMissingInDev) {
                return next();
            }
            logger.warn('[originCheck] rejecting request without Origin/Referer', {
                requestId: req.id,
                path: req.originalUrl,
                ip: req.ip,
            });
            return res.status(403).json({ success: false, error: 'origin_required' });
        }

        if (allowedOrigins.length === 0) {
            // Misconfigured: fail closed in production, open in dev.
            if (isProduction) {
                logger.error('[originCheck] no allowed origins configured but production', {
                    requestId: req.id,
                });
                return res.status(403).json({ success: false, error: 'origin_not_allowed' });
            }
            return next();
        }

        if (allowedOrigins.includes(origin)) {
            return next();
        }

        logger.warn('[originCheck] rejecting cross-origin request', {
            requestId: req.id,
            origin,
            path: req.originalUrl,
            ip: req.ip,
        });
        return res.status(403).json({ success: false, error: 'origin_not_allowed' });
    };
}

module.exports = originCheck;
module.exports.buildAllowedOrigins = buildAllowedOrigins;
