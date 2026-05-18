// tests/integration/originCheck.test.js

jest.mock('../../utils/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    http: () => {},
    stream: { write: () => {} },
}));

// Force a known FRONTEND_URL before requiring config / middleware.
process.env.FRONTEND_URL = 'https://app.example.com,https://admin.example.com';

const express = require('express');
const request = require('supertest');

// Require lazily so the env above is honoured.
const originCheck = require('../../middleware/originCheck');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.post('/secure', originCheck(), (req, res) => res.json({ ok: true }));
    app.get('/safe', originCheck(), (req, res) => res.json({ ok: true }));
    return app;
}

describe('originCheck middleware', () => {
    const ORIGINAL = { ...process.env };
    afterEach(() => {
        process.env = { ...ORIGINAL };
    });

    test('allows safe methods regardless of Origin', async () => {
        process.env.NODE_ENV = 'production';
        const res = await request(buildApp()).get('/safe');
        expect(res.status).toBe(200);
    });

    test('allows matching Origin', async () => {
        const res = await request(buildApp())
            .post('/secure')
            .set('Origin', 'https://app.example.com')
            .send({});
        expect(res.status).toBe(200);
    });

    test('allows when Referer matches and Origin is absent', async () => {
        const res = await request(buildApp())
            .post('/secure')
            .set('Referer', 'https://admin.example.com/some/page')
            .send({});
        expect(res.status).toBe(200);
    });

    test('rejects unknown Origin', async () => {
        const res = await request(buildApp())
            .post('/secure')
            .set('Origin', 'https://evil.example.org')
            .send({});
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('origin_not_allowed');
    });

    test('rejects request without Origin/Referer in production', async () => {
        process.env.NODE_ENV = 'production';
        const res = await request(buildApp()).post('/secure').send({});
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('origin_required');
    });

    test('allows request without Origin/Referer in development', async () => {
        process.env.NODE_ENV = 'development';
        const res = await request(buildApp()).post('/secure').send({});
        expect(res.status).toBe(200);
    });
});
