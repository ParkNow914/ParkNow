// tests/unit/auditLog.test.js
const auditLog = require('../../middleware/auditLog');

jest.mock('../../utils/logger', () => {
    const calls = { info: [], warn: [], error: [] };
    return {
        __calls: calls,
        info: (...args) => calls.info.push(args),
        warn: (...args) => calls.warn.push(args),
        error: (...args) => calls.error.push(args),
    };
});

const logger = require('../../utils/logger');

function mockRes() {
    const handlers = {};
    const res = {
        statusCode: 200,
        on: (event, cb) => {
            handlers[event] = cb;
        },
        _finish: () => handlers.finish && handlers.finish(),
    };
    return res;
}

describe('auditLog middleware', () => {
    beforeEach(() => {
        logger.__calls.info = [];
        logger.__calls.warn = [];
    });

    test('logs success at info level on 2xx', () => {
        const mw = auditLog('test.action');
        const req = {
            id: 'r1',
            method: 'POST',
            originalUrl: '/api/test',
            ip: '127.0.0.1',
            get: () => 'jest-agent',
            user: { id: 42 },
        };
        const res = mockRes();
        mw(req, res, () => {});
        res.statusCode = 201;
        res._finish();

        expect(logger.__calls.info).toHaveLength(1);
        const [, meta] = logger.__calls.info[0];
        expect(meta).toMatchObject({
            action: 'test.action',
            actor: 'user:42',
            target: '/api/test',
            method: 'POST',
            outcome: 201,
            requestId: 'r1',
        });
    });

    test('logs failure at warn level on 4xx', () => {
        const mw = auditLog('test.fail');
        const req = {
            method: 'POST',
            originalUrl: '/api/x',
            ip: '1.2.3.4',
            get: () => undefined,
        };
        const res = mockRes();
        mw(req, res, () => {});
        res.statusCode = 403;
        res._finish();

        expect(logger.__calls.warn).toHaveLength(1);
        const [, meta] = logger.__calls.warn[0];
        expect(meta.actor).toBe('ip:1.2.3.4');
        expect(meta.outcome).toBe(403);
    });

    test('throws when action is missing', () => {
        expect(() => auditLog()).toThrow();
        expect(() => auditLog('')).toThrow();
    });
});
