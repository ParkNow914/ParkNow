// tests/integration/idempotency.test.js
//
// Validates that the idempotency middleware:
//   - lets the first request through and caches the JSON response
//   - replays the cached response for subsequent requests with the same key
//   - rejects reuse of the same key with a different body
//   - rejects malformed keys

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
const idempotency = require('../../middleware/idempotency');

function buildApp() {
    const app = express();
    app.use(express.json());
    let counter = 0;
    app.post('/pay', idempotency(), (req, res) => {
        counter += 1;
        res.status(201).json({ ok: true, count: counter, body: req.body });
    });
    return app;
}

describe('idempotency middleware', () => {
    test('caches and replays the response for repeated keys', async () => {
        const app = buildApp();
        const key = 'abcdef1234567890';

        const first = await request(app)
            .post('/pay')
            .set('Idempotency-Key', key)
            .send({ value: 10 });
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({ ok: true, count: 1 });

        const second = await request(app)
            .post('/pay')
            .set('Idempotency-Key', key)
            .send({ value: 10 });
        expect(second.status).toBe(201);
        expect(second.body).toMatchObject({ ok: true, count: 1 }); // same count → replay
        expect(second.headers['idempotent-replay']).toBe('true');
    });

    test('rejects key reuse with different body (422)', async () => {
        const app = buildApp();
        const key = 'abcdef1234567890';

        await request(app).post('/pay').set('Idempotency-Key', key).send({ value: 10 });
        const conflicting = await request(app)
            .post('/pay')
            .set('Idempotency-Key', key)
            .send({ value: 999 });
        expect(conflicting.status).toBe(422);
        expect(conflicting.body.error).toBe('idempotency_key_mismatch');
    });

    test('rejects malformed key', async () => {
        const app = buildApp();
        const res = await request(app)
            .post('/pay')
            .set('Idempotency-Key', 'has spaces!!')
            .send({ value: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_idempotency_key');
    });

    test('passes through when header is absent and not required', async () => {
        const app = buildApp();
        const res = await request(app).post('/pay').send({ value: 1 });
        expect(res.status).toBe(201);
        expect(res.body.count).toBe(1);
    });
});
