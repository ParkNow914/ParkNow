// tests/integration/metrics.test.js

jest.mock('../../utils/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    http: () => {},
    stream: { write: () => {} },
}));

const express = require('express');
const request = require('supertest');
const { metricsMiddleware, metricsHandler, register } = require('../../utils/metrics');

function buildApp() {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/hello', (req, res) => res.json({ ok: true }));
    app.get('/metrics', metricsHandler);
    return app;
}

describe('metrics endpoint', () => {
    beforeEach(() => {
        // Reset metric values so assertions on counters are stable.
        register.resetMetrics();
    });

    test('exposes Prometheus text and includes http_requests_total after a hit', async () => {
        const app = buildApp();

        // Generate one request to /hello so the counter increments.
        const hit = await request(app).get('/hello');
        expect(hit.status).toBe(200);

        const metrics = await request(app).get('/metrics');
        expect(metrics.status).toBe(200);
        expect(metrics.headers['content-type']).toMatch(/text\/plain/);
        expect(metrics.text).toMatch(/# HELP http_requests_total/);
        expect(metrics.text).toMatch(/http_requests_total\{[^}]*route="\/hello"[^}]*\} 1/);
        // Default node metrics should also be present.
        expect(metrics.text).toMatch(/process_cpu_user_seconds_total/);
    });
});
