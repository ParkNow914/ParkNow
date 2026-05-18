// tests/integration/health.test.js
//
// Smoke test for the /health and /health/ready endpoints. We mock the DB pool
// to avoid requiring a live PostgreSQL during CI, and to be able to assert
// both the healthy (200) and unhealthy (503) readiness paths.

jest.mock('../../utils/dbUtils', () => {
    const state = { shouldFail: false };
    return {
        __setShouldFail: (v) => {
            state.shouldFail = v;
        },
        pool: {
            connect: async () => {
                if (state.shouldFail) {
                    throw new Error('simulated DB connection failure');
                }
                return {
                    query: async () => ({ rows: [{ '?column?': 1 }] }),
                    release: () => {},
                };
            },
        },
        // Stubs in case anything else pulls these in transitively.
        testConnection: async () => true,
        closePool: async () => {},
        query: async () => ({ rows: [] }),
    };
});

// The logger writes to disk in some configurations; silence it for tests.
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
const dbUtilsMock = require('../../utils/dbUtils');
const healthRoutes = require('../../routes/healthRoutes');

function buildApp() {
    const app = express();
    app.use('/', healthRoutes);
    return app;
}

describe('health endpoints', () => {
    test('GET /health returns 200 with status payload', async () => {
        const res = await request(buildApp()).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'ok', service: 'parknow' });
        expect(typeof res.body.uptime_seconds).toBe('number');
        expect(typeof res.body.timestamp).toBe('string');
    });

    test('GET /health/ready returns 200 when DB is reachable', async () => {
        dbUtilsMock.__setShouldFail(false);
        const res = await request(buildApp()).get('/health/ready');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'ready', checks: { database: 'ok' } });
    });

    test('GET /health/ready returns 503 when DB is unreachable', async () => {
        dbUtilsMock.__setShouldFail(true);
        const res = await request(buildApp()).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({ status: 'not_ready', checks: { database: 'error' } });
        dbUtilsMock.__setShouldFail(false);
    });
});
