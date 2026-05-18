// utils/metrics.js
//
// Centralized Prometheus metrics for ParkNow. Exposes:
//   - default Node.js process metrics (CPU, memory, event loop lag, ...)
//   - http_requests_total (counter, labelled method/route/status)
//   - http_request_duration_seconds (histogram, labelled method/route)
//
// Route labelling intentionally uses `req.route?.path` (e.g. /users/:id)
// rather than `req.originalUrl` to avoid high-cardinality label values.

const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({ app: 'parknow' });
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests received',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route'],
    // Buckets chosen for typical API latencies (5 ms .. 10 s).
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});

function metricsMiddleware(req, res, next) {
    const startNs = process.hrtime.bigint();

    res.on('finish', () => {
        // Skip metrics endpoint itself to avoid feedback loop noise.
        if (req.path === '/metrics') return;

        const route = req.route?.path || req.baseUrl + (req.route?.path || '') || 'unknown';
        const method = req.method;
        const status = String(res.statusCode);
        const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;

        httpRequestsTotal.inc({ method, route, status });
        httpRequestDurationSeconds.observe({ method, route }, durationSec);
    });

    next();
}

async function metricsHandler(_req, res) {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
}

module.exports = {
    register,
    metricsMiddleware,
    metricsHandler,
    httpRequestsTotal,
    httpRequestDurationSeconds,
};
