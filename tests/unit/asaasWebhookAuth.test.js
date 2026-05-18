// tests/unit/asaasWebhookAuth.test.js
const asaasWebhookAuth = require('../../middleware/asaasWebhookAuth');

function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        end() {
            return this;
        },
    };
    return res;
}

function mockReq(headers = {}, overrides = {}) {
    return {
        id: 'test-req',
        ip: '127.0.0.1',
        get(name) {
            const key = name.toLowerCase();
            for (const [k, v] of Object.entries(headers)) {
                if (k.toLowerCase() === key) return v;
            }
            return undefined;
        },
        ...overrides,
    };
}

describe('asaasWebhookAuth', () => {
    const ORIGINAL = { ...process.env };

    afterEach(() => {
        process.env = { ...ORIGINAL };
    });

    test('allows the request when secret matches', () => {
        process.env.NODE_ENV = 'production';
        process.env.ASAAS_WEBHOOK_SECRET = 'top-secret-token-123';
        const req = mockReq({ 'asaas-access-token': 'top-secret-token-123' });
        const res = mockRes();
        let nextCalled = false;
        asaasWebhookAuth(req, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBe(200);
    });

    test('rejects with 401 when token is missing in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.ASAAS_WEBHOOK_SECRET = 'top-secret-token-123';
        const req = mockReq({});
        const res = mockRes();
        let nextCalled = false;
        asaasWebhookAuth(req, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'unauthorized' });
    });

    test('rejects with 401 when token mismatches', () => {
        process.env.NODE_ENV = 'production';
        process.env.ASAAS_WEBHOOK_SECRET = 'top-secret-token-123';
        const req = mockReq({ 'asaas-access-token': 'wrong-token-of-same-length-XX' });
        const res = mockRes();
        asaasWebhookAuth(req, res, () => {});
        expect(res.statusCode).toBe(401);
    });

    test('returns 503 in production when secret is unset', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.ASAAS_WEBHOOK_SECRET;
        const req = mockReq({ 'asaas-access-token': 'anything' });
        const res = mockRes();
        asaasWebhookAuth(req, res, () => {});
        expect(res.statusCode).toBe(503);
    });

    test('allows in development when secret unset', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.ASAAS_WEBHOOK_SECRET;
        const req = mockReq({});
        const res = mockRes();
        let nextCalled = false;
        asaasWebhookAuth(req, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);
    });
});
