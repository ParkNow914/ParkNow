// tests/integration/lgpd.test.js
// Testa o controller LGPD (export + exclusão) com auth e banco MOCKADOS —
// roda sem Postgres, de forma determinística.

const express = require('express');
const request = require('supertest');

// Silencia o logger.
jest.mock('../../utils/logger', () => ({
    info() {},
    warn() {},
    error() {},
    debug() {},
    http() {},
    stream: { write() {} },
}));

// argon2 real é lento (hash nativo); mock devolve um hash fixo.
jest.mock('argon2', () => ({ hash: jest.fn(async () => '$argon2-mock') }));

// Auth: injeta um titular autenticado sem tocar em JWT/DB.
jest.mock('../../middleware/authMiddleware', () => ({
    protectUser: (req, _res, next) => {
        req.user = { id: 42, nome: 'Fulano', email: 'fulano@example.com' };
        next();
    },
    invalidateUserCache: jest.fn(),
}));

// Pool do Postgres: pool.query (selects) e pool.connect (transação).
const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };
jest.mock('../../utils/dbUtils', () => ({
    pool: {
        query: (...args) => mockQuery(...args),
        connect: jest.fn(async () => mockClient),
    },
}));

const errorMiddleware = require('../../middleware/errorMiddleware');
const lgpdRoutes = require('../../routes/lgpdRoutes');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/lgpd', lgpdRoutes);
    app.use(errorMiddleware);
    return app;
}

describe('LGPD API', () => {
    beforeEach(() => {
        mockQuery.mockReset();
        mockClient.query.mockReset();
        mockClient.release.mockReset();
    });

    test('GET /api/lgpd/export devolve os dados do titular como download', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: 42, nome: 'Fulano', email: 'fulano@example.com' }] }) // titular
            .mockResolvedValue({ rows: [] }); // veiculos / reservas / notificacoes / pagamentos

        const res = await request(buildApp()).get('/api/lgpd/export');

        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toContain('parknow-meus-dados.json');
        const body = JSON.parse(res.text);
        expect(body.titular.id).toBe(42);
        expect(body).toHaveProperty('veiculos');
        expect(body).toHaveProperty('reservas');
        expect(body).toHaveProperty('notificacoes');
        expect(body).toHaveProperty('pagamentos');
    });

    test('DELETE /api/lgpd/account rejeita sem a frase de confirmação', async () => {
        const res = await request(buildApp())
            .delete('/api/lgpd/account')
            .send({ confirmacao: 'qualquer coisa' });

        expect(res.status).toBe(400);
        expect(mockClient.query).not.toHaveBeenCalled(); // não abre transação
    });

    test('DELETE /api/lgpd/account anonimiza o cadastro quando confirmado', async () => {
        mockClient.query
            .mockResolvedValueOnce({}) // BEGIN
            .mockResolvedValueOnce({}) // DELETE veiculos
            .mockResolvedValueOnce({}) // DELETE notificacoes
            .mockResolvedValueOnce({}) // DELETE logs_veiculos
            .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE usuarios
            .mockResolvedValueOnce({}); // COMMIT

        const res = await request(buildApp())
            .delete('/api/lgpd/account')
            .send({ confirmacao: 'EXCLUIR MINHA CONTA' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const sqls = mockClient.query.mock.calls.map((c) => c[0]);
        expect(sqls.some((sql) => /UPDATE usuarios/.test(sql))).toBe(true);
        expect(sqls).toContain('BEGIN');
        expect(sqls).toContain('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
    });
});
