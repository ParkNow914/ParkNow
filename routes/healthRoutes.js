// routes/healthRoutes.js
// Liveness and readiness endpoints, mounted at the application root.
//
// - GET /health         → liveness: the process is up and responding (cheap).
// - GET /health/ready   → readiness: dependencies (DB) are reachable.
//
// Designed to be consumed by Docker HEALTHCHECK, Kubernetes probes, and
// uptime monitors. Responses are intentionally small and never leak secrets.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');

const router = express.Router();

// Process start time, used to report uptime.
const startedAt = Date.now();

// Rate limit the readiness probe specifically: it touches the DB and could be
// abused to amplify load. Liveness stays unlimited because it does no I/O.
// Generous limit (1 req/sec sustained) so legitimate orchestrator probes pass.
const readinessLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'not_ready', error: 'rate_limited' },
});

router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'parknow',
        uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
    });
});

router.get('/health/ready', readinessLimiter, async (req, res) => {
    const checks = { database: 'unknown' };
    let httpStatus = 200;

    try {
        // Short, bounded query — never block the readiness probe.
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            checks.database = 'ok';
        } finally {
            client.release();
        }
    } catch (err) {
        checks.database = 'error';
        httpStatus = 503;
        logger.warn('[health] readiness DB check failed:', { error: err.message, requestId: req.id });
    }

    res.status(httpStatus).json({
        status: httpStatus === 200 ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
