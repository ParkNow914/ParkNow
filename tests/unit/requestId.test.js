// tests/unit/requestId.test.js
const requestId = require('../../middleware/requestId');

function mockReqRes(headers = {}) {
    const req = { get: (h) => headers[h.toLowerCase()] || headers[h] || undefined };
    const headersOut = {};
    const res = {
        setHeader: (k, v) => {
            headersOut[k] = v;
        },
        getHeader: (k) => headersOut[k],
    };
    return { req, res, headersOut };
}

describe('requestId middleware', () => {
    test('generates a UUID when no incoming header is present', () => {
        const { req, res, headersOut } = mockReqRes();
        let called = false;
        requestId(req, res, () => {
            called = true;
        });
        expect(called).toBe(true);
        expect(typeof req.id).toBe('string');
        expect(req.id).toMatch(/^[0-9a-fA-F-]{36}$/);
        expect(headersOut['X-Request-Id']).toBe(req.id);
    });

    test('reuses a valid incoming X-Request-Id header', () => {
        const { req, res, headersOut } = mockReqRes({ 'X-Request-Id': 'trace-abc-123' });
        requestId(req, res, () => {});
        expect(req.id).toBe('trace-abc-123');
        expect(headersOut['X-Request-Id']).toBe('trace-abc-123');
    });

    test('rejects malformed incoming X-Request-Id and falls back to UUID', () => {
        const { req, res } = mockReqRes({ 'X-Request-Id': 'has spaces and \n newlines' });
        requestId(req, res, () => {});
        expect(req.id).not.toBe('has spaces and \n newlines');
        expect(req.id).toMatch(/^[0-9a-fA-F-]{36}$/);
    });

    test('rejects an oversized incoming X-Request-Id', () => {
        const huge = 'a'.repeat(200);
        const { req, res } = mockReqRes({ 'X-Request-Id': huge });
        requestId(req, res, () => {});
        expect(req.id).not.toBe(huge);
        expect(req.id).toMatch(/^[0-9a-fA-F-]{36}$/);
    });
});
