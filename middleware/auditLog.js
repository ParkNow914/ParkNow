// middleware/auditLog.js
//
// Audit log middleware for security-sensitive endpoints.
//
// Emits a structured log entry (via the application logger) for each request
// matching the configured event name, capturing:
//   - actor (user/admin id when available, else IP)
//   - action (provided event name)
//   - target (request path)
//   - outcome (HTTP status)
//   - requestId, timestamp, ip, userAgent
//
// We intentionally do NOT log request bodies or headers verbatim because they
// may contain credentials, tokens, or PII. Callers that need to log specific
// fields should do so explicitly inside their handler.

const logger = require('../utils/logger');

function sanitize(value, maxLen = 200) {
    if (value == null) return undefined;
    const s = String(value);
    return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/**
 * @param {string} action  - short event name, e.g. 'auth.login', 'admin.user.disable'.
 * @returns {Function} express middleware
 */
function auditLog(action) {
    if (!action || typeof action !== 'string') {
        throw new Error('auditLog requires a non-empty action name');
    }
    return function auditLogMiddleware(req, res, next) {
        const startedAt = Date.now();

        res.on('finish', () => {
            const actor =
                req.user?.id != null
                    ? `user:${req.user.id}`
                    : req.admin?.id != null
                      ? `admin:${req.admin.id}`
                      : `ip:${req.ip || 'unknown'}`;

            // 4xx/5xx → warn, success → info.
            const level = res.statusCode >= 400 ? 'warn' : 'info';

            logger[level]('[audit]', {
                action,
                actor,
                target: sanitize(req.originalUrl, 300),
                method: req.method,
                outcome: res.statusCode,
                durationMs: Date.now() - startedAt,
                ip: sanitize(req.ip, 64),
                userAgent: sanitize(req.get('User-Agent'), 200),
                requestId: req.id,
                timestamp: new Date().toISOString(),
            });
        });

        next();
    };
}

module.exports = auditLog;
