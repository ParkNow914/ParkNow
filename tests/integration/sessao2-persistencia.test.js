// tests/integration/sessao2-persistencia.test.js
//
// Testa a persistência da Sessão 2 (tempStorage + PostgresIdempotencyStore)
// contra um Postgres real. Skipa graciosamente se não houver DB acessível,
// para não quebrar `npm test` local sem banco. No CI (service postgres + env
// PG_*), roda de verdade.

const { Pool } = require('pg');

const PG = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'parknow_test',
    ssl: false,
    connectionTimeoutMillis: 3000,
};

let dbAvailable = false;
let probePool;

beforeAll(async () => {
    probePool = new Pool(PG);
    try {
        await probePool.query('SELECT 1');
        // Garante as tabelas (idempotente) caso o migrate não tenha rodado.
        await probePool.query(`
            CREATE TABLE IF NOT EXISTS parceria_solicitacoes (
                chave VARCHAR(255) PRIMARY KEY, dados JSONB NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
        await probePool.query(`
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                key VARCHAR(255) PRIMARY KEY, fingerprint VARCHAR(128),
                status VARCHAR(20) NOT NULL DEFAULT 'in_progress', status_code INTEGER,
                body JSONB, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
            )`);
        dbAvailable = true;
    } catch (_e) {
        dbAvailable = false;
    }
});

afterAll(async () => {
    if (probePool) await probePool.end().catch(() => {});
});

describe('Sessão 2 — PostgresIdempotencyStore', () => {
    test('ciclo in_progress → completed → delete', async () => {
        if (!dbAvailable) return; // skip sem DB
        const idempotency = require('../../middleware/idempotency');
        const store = new idempotency.PostgresIdempotencyStore(probePool);

        const key = 'test_idem_' + Date.now();
        await store.setInProgress(key, 'fp-x');
        const a = await store.get(key);
        expect(a.status).toBe('in_progress');
        expect(a.fingerprint).toBe('fp-x');

        await store.setCompleted(key, { statusCode: 201, body: { ok: true }, fingerprint: 'fp-x' });
        const b = await store.get(key);
        expect(b.status).toBe('completed');
        expect(b.statusCode).toBe(201);
        expect(b.body).toEqual({ ok: true });

        await store.delete(key);
        const c = await store.get(key);
        expect(c).toBeUndefined();
    });

    test('get retorna undefined para chave inexistente', async () => {
        if (!dbAvailable) return;
        const idempotency = require('../../middleware/idempotency');
        const store = new idempotency.PostgresIdempotencyStore(probePool);
        expect(await store.get('inexistente_' + Date.now())).toBeUndefined();
    });
});

describe('Sessão 2 — validação de dados de parceria', () => {
    test('aceita dados válidos e rejeita inválidos', () => {
        const ts = require('../../utils/tempStorage');
        const ok = {
            nome: 'Joao Silva', email: 'j@x.com', senha: '12345678',
            nomeEstacionamento: 'Estac Centro', enderecoEstacionamento: 'Rua das Flores 100',
            cnpj: '12.345.678/0001-90', numeroVagas: 50,
        };
        expect(() => ts._validateParkingData(ok)).not.toThrow();
        expect(() => ts._validateParkingData({ ...ok, cnpj: 'invalido' })).toThrow();
        expect(() => ts._validateParkingData({ ...ok, numeroVagas: 0 })).toThrow();
        expect(() => ts._validateParkingData(null)).toThrow();
    });
});
