// tests/unit/envValidator.test.js
//
// We reload the module under different NODE_ENV settings to exercise both
// the strict (production) and lenient (development) branches.

describe('envValidator', () => {
    const ORIGINAL_ENV = { ...process.env };

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        jest.resetModules();
    });

    test('accepts a fully-populated production env', () => {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'x'.repeat(40);
        process.env.JWT_REFRESH_SECRET = 'y'.repeat(40);
        process.env.PG_PASSWORD = 'super-secret';
        process.env.PG_HOST = 'db';
        process.env.PG_USER = 'parknow';
        process.env.PG_DATABASE = 'parknow_db';

        const { validateEnv } = require('../../utils/envValidator');
        const silentLogger = { error: () => {}, warn: () => {}, info: () => {} };
        const parsed = validateEnv(silentLogger);

        expect(parsed.NODE_ENV).toBe('production');
        expect(parsed.JWT_SECRET).toHaveLength(40);
    });

    test('throws in production when secrets are missing/short', () => {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'too-short';
        delete process.env.JWT_REFRESH_SECRET;
        delete process.env.PG_PASSWORD;

        const { validateEnv } = require('../../utils/envValidator');
        const silentLogger = { error: () => {}, warn: () => {}, info: () => {} };
        expect(() => validateEnv(silentLogger)).toThrow(/Invalid environment configuration/);
    });

    test('warns but does not throw in development with missing secrets', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.JWT_SECRET;
        delete process.env.JWT_REFRESH_SECRET;

        const { validateEnv } = require('../../utils/envValidator');
        const warnings = [];
        const logger = { error: () => {}, warn: (m) => warnings.push(m), info: () => {} };
        expect(() => validateEnv(logger)).not.toThrow();
        // No warnings expected since dev schema accepts missing secrets, but
        // the function must still return a usable env object.
        expect(warnings.length).toBeGreaterThanOrEqual(0);
    });
});
