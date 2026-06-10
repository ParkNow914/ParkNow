// tests/unit/apiKeyMiddleware.test.js
//
// Garante o comportamento fail-closed do middleware de API key dos endpoints
// de cron: sem CRON_API_KEY configurada o endpoint é negado (503); a chave só
// é aceita via header x-api-key e a comparação é exata.

jest.mock('../../utils/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
}));

const { validateApiKey } = require('../../middleware/apiKeyMiddleware');

function buildReq({ apiKeyHeader, apiKeyQuery } = {}) {
    return {
        headers: apiKeyHeader ? { 'x-api-key': apiKeyHeader } : {},
        query: apiKeyQuery ? { apiKey: apiKeyQuery } : {},
        path: '/cron/teste',
        method: 'POST',
        ip: '127.0.0.1',
    };
}

describe('apiKeyMiddleware.validateApiKey', () => {
    const ORIGINAL_KEY = process.env.CRON_API_KEY;

    afterEach(() => {
        if (ORIGINAL_KEY === undefined) delete process.env.CRON_API_KEY;
        else process.env.CRON_API_KEY = ORIGINAL_KEY;
    });

    test('falha fechado (503) quando CRON_API_KEY não está configurada', () => {
        delete process.env.CRON_API_KEY;
        const next = jest.fn();
        validateApiKey(buildReq({ apiKeyHeader: 'qualquer' }), {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        const err = next.mock.calls[0][0];
        expect(err).toBeInstanceOf(Error);
        expect(err.statusCode).toBe(503);
    });

    test('retorna 401 quando a chave não é fornecida', () => {
        process.env.CRON_API_KEY = 'chave-secreta-valida';
        const next = jest.fn();
        validateApiKey(buildReq(), {}, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(401);
    });

    test('retorna 403 quando a chave é inválida', () => {
        process.env.CRON_API_KEY = 'chave-secreta-valida';
        const next = jest.fn();
        validateApiKey(buildReq({ apiKeyHeader: 'chave-errada' }), {}, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(403);
    });

    test('NÃO aceita a chave via query string (só header)', () => {
        process.env.CRON_API_KEY = 'chave-secreta-valida';
        const next = jest.fn();
        validateApiKey(buildReq({ apiKeyQuery: 'chave-secreta-valida' }), {}, next);
        const err = next.mock.calls[0][0];
        expect(err.statusCode).toBe(401);
    });

    test('aceita a chave correta via header e segue o fluxo', () => {
        process.env.CRON_API_KEY = 'chave-secreta-valida';
        const next = jest.fn();
        validateApiKey(buildReq({ apiKeyHeader: 'chave-secreta-valida' }), {}, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0]).toBeUndefined();
    });
});
