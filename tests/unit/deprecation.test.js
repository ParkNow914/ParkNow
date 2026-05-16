// tests/unit/deprecation.test.js
// Cobertura do middleware RFC 8594 (Deprecation / Sunset / Link).

const { deprecate, _clearCache } = require('../../middleware/deprecation');

function mockReq(overrides = {}) {
    return {
        method: 'GET',
        originalUrl: '/api/legacy',
        ip: '127.0.0.1',
        id: 'req-test',
        ...overrides,
    };
}

function mockRes() {
    const headers = {};
    return {
        headers,
        setHeader(name, value) {
            headers[name] = value;
        },
        getHeader(name) {
            return headers[name];
        },
    };
}

describe('middleware/deprecation', () => {
    beforeEach(() => _clearCache());

    test('sets Deprecation: true on every call', () => {
        const mw = deprecate();
        const res = mockRes();
        let nextCalled = false;
        mw(mockReq(), res, () => { nextCalled = true; });
        expect(res.getHeader('Deprecation')).toBe('true');
        expect(nextCalled).toBe(true);
    });

    test('formats Sunset as an HTTP-date when given a valid ISO string', () => {
        const mw = deprecate({ sunset: '2027-01-01' });
        const res = mockRes();
        mw(mockReq(), res, () => {});
        const sunset = res.getHeader('Sunset');
        expect(sunset).toBeDefined();
        // RFC 7231 HTTP-date — ends with GMT
        expect(sunset).toMatch(/GMT$/);
        // The year must be preserved
        expect(sunset).toContain('2027');
    });

    test('omits Sunset when the input is unparseable', () => {
        const mw = deprecate({ sunset: 'not-a-date' });
        const res = mockRes();
        mw(mockReq(), res, () => {});
        expect(res.getHeader('Sunset')).toBeUndefined();
    });

    test('emits Link with successor-version when replacement is provided', () => {
        const mw = deprecate({ replacement: '/api/v2/foo' });
        const res = mockRes();
        mw(mockReq(), res, () => {});
        expect(res.getHeader('Link')).toBe('</api/v2/foo>; rel="successor-version"');
    });

    test('appends a deprecation doc link when docs is provided', () => {
        const mw = deprecate({ replacement: '/api/v2/foo', docs: '/api/docs' });
        const res = mockRes();
        mw(mockReq(), res, () => {});
        const link = res.getHeader('Link');
        expect(link).toContain('rel="successor-version"');
        expect(link).toContain('rel="deprecation"');
        expect(link).toContain('</api/docs>');
    });

    test('omits Link when neither replacement nor docs is given', () => {
        const mw = deprecate({});
        const res = mockRes();
        mw(mockReq(), res, () => {});
        expect(res.getHeader('Link')).toBeUndefined();
    });

    test('calls next() exactly once per invocation', () => {
        const mw = deprecate({ replacement: '/api/v2' });
        const res = mockRes();
        let count = 0;
        mw(mockReq(), res, () => { count++; });
        expect(count).toBe(1);
    });
});
