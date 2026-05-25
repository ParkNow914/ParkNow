// tests/unit/openapi.test.js
// Garantia mínima de que a spec OpenAPI é construída sem erros fatais e que
// os contratos públicos importantes (segurança, tags base) estão presentes.

const { buildSpec } = require('../../utils/openapi');

describe('OpenAPI spec', () => {
    let spec;
    beforeAll(() => {
        spec = buildSpec();
    });

    test('builds a 3.0.x spec', () => {
        expect(spec).toBeDefined();
        expect(spec.openapi).toMatch(/^3\./);
    });

    test('defines bearerAuth and cookieAuth security schemes', () => {
        const schemes = spec.components?.securitySchemes || {};
        expect(schemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
        expect(schemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie' });
        // No external gateway webhook security scheme in the always-free build.
        expect(schemes.asaasWebhookToken).toBeUndefined();
    });

    test('declares the canonical tag groups', () => {
        const tagNames = (spec.tags || []).map((t) => t.name);
        for (const required of ['Auth', 'Reservas', 'Pagamentos', 'Health', 'Observability']) {
            expect(tagNames).toContain(required);
        }
    });

    test('exposes /health, /health/ready and /metrics', () => {
        expect(spec.paths['/health']).toBeDefined();
        expect(spec.paths['/health/ready']).toBeDefined();
        expect(spec.paths['/metrics']).toBeDefined();
    });

    test('aggregates JSDoc paths from route files (more than just the seeded ones)', () => {
        // The 3 seeded paths are health, health/ready, metrics. Anything beyond
        // that must come from `@swagger` blocks in routes/controllers.
        const pathCount = Object.keys(spec.paths || {}).length;
        expect(pathCount).toBeGreaterThan(3);
    });
});
