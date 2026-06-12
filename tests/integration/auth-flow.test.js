// tests/integration/auth-flow.test.js
//
// Fluxo de autenticação de usuário contra um Postgres real, exercitando as
// rotas reais (validação, controller, model e cookies):
//   register → login (senha errada/correta) → rota protegida → refresh → logout
//
// Skipa graciosamente sem DB (mesmo padrão dos demais testes de integração).

process.env.PG_DATABASE = process.env.PG_DATABASE || 'parknow_test';
process.env.PG_PASSWORD = process.env.PG_PASSWORD || 'postgres';

jest.mock('../../utils/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    http: () => {},
    stream: { write: () => {} },
}));

// Sem SMTP nos testes: e-mail de verificação é best-effort no cadastro.
jest.mock('../../utils/emailUtils', () => ({
    sendEmail: jest.fn().mockResolvedValue(true),
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { Pool } = require('pg');

const PG = {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: false,
    connectionTimeoutMillis: 3000,
};

let dbAvailable = false;
let probePool;
let app;

const EMAIL = `auth_flow_${Date.now()}@teste.dev`;
const SENHA = 'SenhaForte!2026#pk';

beforeAll(async () => {
    probePool = new Pool(PG);
    try {
        await probePool.query('SELECT 1 FROM usuarios LIMIT 1');
        dbAvailable = true;
        // Rate limiting agora é persistido no Postgres: zera os contadores de
        // auth para a suíte não tropeçar no próprio limite em execuções repetidas.
        await probePool
            .query("DELETE FROM rate_limits WHERE key LIKE 'auth_%'")
            .catch(() => {});
    } catch (_e) {
        dbAvailable = false;
        return;
    }

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.set('cookieOptions', { httpOnly: true, secure: false, sameSite: 'lax', path: '/api/auth' });
    app.use('/api/auth', require('../../routes/authRoutes'));
    app.use('/api/user', require('../../routes/userRoutes'));
    app.use(require('../../middleware/errorMiddleware'));
});

afterAll(async () => {
    if (dbAvailable) {
        await probePool.query('DELETE FROM usuarios WHERE email = $1', [EMAIL]).catch(() => {});
    }
    if (probePool) await probePool.end().catch(() => {});
    const dbUtils = require('../../utils/dbUtils');
    if (dbUtils.closePool) await dbUtils.closePool().catch(() => {});
    const cfgDb = require('../../config/database');
    if (cfgDb.pool && cfgDb.pool.end) await cfgDb.pool.end().catch(() => {});
});

describe('Fluxo de autenticação do usuário', () => {
    test('register cria a conta (201) e rejeita e-mail duplicado (409)', async () => {
        if (!dbAvailable) return;
        const payload = {
            nome: 'Usuária Fluxo',
            email: EMAIL,
            senha: SENHA,
            confirmarSenha: SENHA,
            telefone: '11999990000',
            tipo_veiculo: 'Carro',
            placa_veiculo: 'ABC1D23',
        };

        const r1 = await request(app).post('/api/auth/register').send(payload);
        expect(r1.status).toBe(201);

        const r2 = await request(app).post('/api/auth/register').send(payload);
        expect(r2.status).toBe(409);
    });

    test('register rejeita senha fraca (400)', async () => {
        if (!dbAvailable) return;
        const r = await request(app).post('/api/auth/register').send({
            nome: 'Senha Fraca',
            email: `fraca_${Date.now()}@teste.dev`,
            senha: '123456',
            confirmarSenha: '123456',
            telefone: '11999990000',
            tipo_veiculo: 'Carro',
            placa_veiculo: 'ABC1D23',
        });
        expect(r.status).toBe(400);
    });

    test('login com senha errada → 401; sem vazamento de qual campo errou', async () => {
        if (!dbAvailable) return;
        const r = await request(app)
            .post('/api/auth/login')
            .send({ email: EMAIL, senha: 'senha-completamente-errada-123!' });
        expect(r.status).toBe(401);
        expect(JSON.stringify(r.body)).not.toMatch(/senha incorreta|usu[aá]rio n[aã]o existe/i);
    });

    test('login correto → accessToken + cookie httpOnly de refresh; rota protegida funciona', async () => {
        if (!dbAvailable) return;
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: EMAIL, senha: SENHA });
        expect(login.status).toBe(200);
        expect(login.body.accessToken).toBeTruthy();
        expect(login.body.user.senha).toBeUndefined();

        const setCookie = login.headers['set-cookie'] || [];
        const refreshCookie = setCookie.find((c) => c.toLowerCase().includes('refreshtoken'));
        expect(refreshCookie).toBeTruthy();
        expect(refreshCookie.toLowerCase()).toContain('httponly');

        // Rota protegida com o access token
        const profile = await request(app)
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${login.body.accessToken}`);
        expect(profile.status).toBe(200);
        expect(profile.body.email).toBe(EMAIL);

        // Sem token → 401
        const anon = await request(app).get('/api/user/profile');
        expect(anon.status).toBe(401);

        // Token adulterado → 401
        const tampered = await request(app)
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${login.body.accessToken}x`);
        expect(tampered.status).toBe(401);

        // Refresh com o cookie → novo access token
        const refresh = await request(app)
            .post('/api/auth/refresh-token')
            .set('Cookie', refreshCookie.split(';')[0]);
        expect(refresh.status).toBe(200);
        expect(refresh.body.accessToken).toBeTruthy();

        // Logout limpa o refresh token
        const logout = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', refreshCookie.split(';')[0]);
        expect(logout.status).toBe(200);
    });

    test('refresh sem cookie → 401', async () => {
        if (!dbAvailable) return;
        const r = await request(app).post('/api/auth/refresh-token');
        expect([400, 401, 403]).toContain(r.status);
    });
});
