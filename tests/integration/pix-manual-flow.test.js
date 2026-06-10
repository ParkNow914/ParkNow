// tests/integration/pix-manual-flow.test.js
//
// Testa o coração do fluxo PIX manual contra um Postgres real:
//   - admin confirma pagamento (RBAC, transição de status, ocupação da vaga)
//   - admin de OUTRO estacionamento é bloqueado (BOLA)
//   - dupla confirmação é rejeitada (409)
//   - rejeição de pagamento registra motivo
//   - expiração de PIX pendente cancela reserva/pagamento e LIBERA a vaga
//     (regressão: vagas ficavam presas em 'reservada' para sempre)
//   - expiração de reservas pendentes vencidas libera a vaga
//
// Skipa graciosamente se não houver DB acessível (mesmo padrão do
// sessao2-persistencia.test.js). No CI (service postgres + env PG_*), roda.

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

// Socket.IO não está inicializado em testes; o controller já trata falha de
// emissão, mas mockamos para garantir silêncio e poder assertar chamadas.
jest.mock('../../services/socketService', () => ({
    emitToAdmin: jest.fn(),
    notificarUsuario: jest.fn(),
    emitAtualizacaoVaga: jest.fn(),
}));

// E-mails de cancelamento são best-effort; sem SMTP nos testes.
jest.mock('../../services/emailService', () => ({
    enviarEmailCancelamentoReserva: jest.fn().mockResolvedValue(true),
}));

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
let pool;
let seed = null;

async function seedBase(suffix) {
    const { rows: [usuario] } = await pool.query(
        `INSERT INTO usuarios (nome, email, senha, telefone)
         VALUES ('Cliente Teste', $1, 'hash-irrelevante', '11999990000')
         RETURNING id`,
        [`cliente_pix_${suffix}@teste.dev`]
    );
    const { rows: [adminDono] } = await pool.query(
        `INSERT INTO admins (nome, email, senha)
         VALUES ('Admin Dono', $1, 'hash-irrelevante') RETURNING id`,
        [`admin_dono_${suffix}@teste.dev`]
    );
    const { rows: [adminIntruso] } = await pool.query(
        `INSERT INTO admins (nome, email, senha)
         VALUES ('Admin Intruso', $1, 'hash-irrelevante') RETURNING id`,
        [`admin_intruso_${suffix}@teste.dev`]
    );
    const { rows: [estacionamento] } = await pool.query(
        `INSERT INTO estacionamentos
            (nome, admin_id, capacidade_total, vagas_disponiveis,
             valor_hora, valor_diaria, valor_mensal, horario_abertura, horario_fechamento)
         VALUES ($1, $2, 10, 10, 10.00, 50.00, 500.00, '08:00', '22:00')
         RETURNING id`,
        [`Estacionamento PIX ${suffix}`, adminDono.id]
    );
    return { usuario, adminDono, adminIntruso, estacionamento };
}

async function seedReservaComPagamento({ suffix, reservaCreatedAt = 'NOW()', dataEntrada = "NOW() + INTERVAL '1 hour'" }) {
    const base = await seedBase(suffix);
    const { rows: [vaga] } = await pool.query(
        `INSERT INTO vagas (numero, estacionamento_id, status)
         VALUES (1, $1, 'reservada') RETURNING id`,
        [base.estacionamento.id]
    );
    const { rows: [reserva] } = await pool.query(
        `INSERT INTO reservas
            (usuario_id, vaga_id, estacionamento_id, data_reserva,
             data_entrada_prevista, data_saida_prevista, status,
             status_pagamento, placa_veiculo, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), ${dataEntrada}, NOW() + INTERVAL '3 hours',
                 'pendente', 'pendente', 'ABC1D23', ${reservaCreatedAt}, NOW())
         RETURNING id`,
        [base.usuario.id, vaga.id, base.estacionamento.id]
    );
    const { rows: [pagamento] } = await pool.query(
        `INSERT INTO pagamentos
            (reserva_id, metodo_pagamento, valor, status, comprovante_url,
             comprovante_enviado_em, created_at, updated_at)
         VALUES ($1, 'pix', 25.50, 'pendente', '/uploads/comprovante-teste.jpg',
                 NOW(), NOW(), NOW())
         RETURNING id`,
        [reserva.id]
    );
    return { ...base, vaga, reserva, pagamento };
}

function buildRes() {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    return res;
}

beforeAll(async () => {
    pool = new Pool(PG);
    try {
        await pool.query('SELECT 1 FROM pagamentos LIMIT 1');
        await pool.query('SELECT 1 FROM reservas LIMIT 1');
        dbAvailable = true;
    } catch (_e) {
        dbAvailable = false;
    }
});

afterAll(async () => {
    if (pool) await pool.end().catch(() => {});
    // Fecha o pool compartilhado usado pelos controllers/serviços
    const dbUtils = require('../../utils/dbUtils');
    if (dbUtils.closePool) await dbUtils.closePool().catch(() => {});
});

describe('PIX manual — confirmação pelo admin', () => {
    test('admin de outro estacionamento NÃO pode confirmar (BOLA)', async () => {
        if (!dbAvailable) return;
        seed = await seedReservaComPagamento({ suffix: `bola_${Date.now()}` });
        const ctrl = require('../../controllers/pixManualConfirmacaoController');

        const next = jest.fn();
        await ctrl.confirmarPagamento(
            { params: { id: String(seed.reserva.id) }, admin: { id: seed.adminIntruso.id } },
            buildRes(),
            next
        );
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0][0].statusCode).toBe(403);

        // Nada mudou no banco
        const { rows: [pag] } = await pool.query('SELECT status FROM pagamentos WHERE id = $1', [seed.pagamento.id]);
        expect(pag.status).toBe('pendente');
    });

    test('admin dono confirma: pagamento aprovado, reserva confirmada, vaga ocupada', async () => {
        if (!dbAvailable) return;
        seed = await seedReservaComPagamento({ suffix: `ok_${Date.now()}` });
        const ctrl = require('../../controllers/pixManualConfirmacaoController');
        const socketService = require('../../services/socketService');

        const res = buildRes();
        const next = jest.fn();
        await ctrl.confirmarPagamento(
            { params: { id: String(seed.reserva.id) }, admin: { id: seed.adminDono.id } },
            res,
            next
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.body.success).toBe(true);

        const { rows: [pag] } = await pool.query(
            'SELECT status, confirmado_por_admin_id, confirmado_em FROM pagamentos WHERE id = $1',
            [seed.pagamento.id]
        );
        expect(pag.status).toBe('aprovado');
        expect(pag.confirmado_por_admin_id).toBe(seed.adminDono.id);
        expect(pag.confirmado_em).not.toBeNull();

        const { rows: [reserva] } = await pool.query(
            'SELECT status, status_pagamento FROM reservas WHERE id = $1',
            [seed.reserva.id]
        );
        expect(reserva.status).toBe('confirmada');
        expect(reserva.status_pagamento).toBe('pago');

        const { rows: [vaga] } = await pool.query(
            'SELECT status, reserva_id_ativa FROM vagas WHERE id = $1',
            [seed.vaga.id]
        );
        expect(vaga.status).toBe('ocupada');
        expect(vaga.reserva_id_ativa).toBe(seed.reserva.id);

        expect(socketService.notificarUsuario).toHaveBeenCalledWith(
            seed.usuario.id,
            'pagamento_confirmado',
            expect.objectContaining({ reserva_id: seed.reserva.id })
        );

        // Dupla confirmação → 409
        const next2 = jest.fn();
        await ctrl.confirmarPagamento(
            { params: { id: String(seed.reserva.id) }, admin: { id: seed.adminDono.id } },
            buildRes(),
            next2
        );
        expect(next2.mock.calls[0][0].statusCode).toBe(409);
    });

    test('rejeição registra motivo e mantém pagamento pendente de reenvio', async () => {
        if (!dbAvailable) return;
        seed = await seedReservaComPagamento({ suffix: `rej_${Date.now()}` });
        const ctrl = require('../../controllers/pixManualConfirmacaoController');

        const res = buildRes();
        const next = jest.fn();
        await ctrl.rejeitarPagamento(
            {
                params: { id: String(seed.reserva.id) },
                admin: { id: seed.adminDono.id },
                body: { motivo: 'Comprovante ilegível' },
            },
            res,
            next
        );
        expect(next).not.toHaveBeenCalled();
        expect(res.body.success).toBe(true);

        const { rows: [pag] } = await pool.query(
            'SELECT status, motivo_rejeicao, rejeitado_em FROM pagamentos WHERE id = $1',
            [seed.pagamento.id]
        );
        expect(pag.status).toBe('pendente');
        expect(pag.motivo_rejeicao).toBe('Comprovante ilegível');
        expect(pag.rejeitado_em).not.toBeNull();
    });

    test('listarAguardandoConfirmacao retorna apenas pagamentos do admin logado', async () => {
        if (!dbAvailable) return;
        seed = await seedReservaComPagamento({ suffix: `list_${Date.now()}` });
        const ctrl = require('../../controllers/pixManualConfirmacaoController');

        const resDono = buildRes();
        await ctrl.listarAguardandoConfirmacao(
            { admin: { id: seed.adminDono.id } }, resDono, jest.fn()
        );
        const idsDono = resDono.body.data.map((p) => p.pagamento_id);
        expect(idsDono).toContain(seed.pagamento.id);

        const resIntruso = buildRes();
        await ctrl.listarAguardandoConfirmacao(
            { admin: { id: seed.adminIntruso.id } }, resIntruso, jest.fn()
        );
        const idsIntruso = resIntruso.body.data.map((p) => p.pagamento_id);
        expect(idsIntruso).not.toContain(seed.pagamento.id);
    });
});

describe('PIX manual — expiração automática', () => {
    test('reserva PIX pendente expirada é cancelada e a vaga é LIBERADA', async () => {
        if (!dbAvailable) return;
        // created_at de 2 horas atrás (timeout default = 30 min)
        seed = await seedReservaComPagamento({
            suffix: `exp_${Date.now()}`,
            reservaCreatedAt: "NOW() - INTERVAL '2 hours'",
        });
        const PixExpirationService = require('../../services/pixExpirationService');

        const { cancelled } = await PixExpirationService.cancelarReservasExpiradas();
        expect(cancelled).toBeGreaterThanOrEqual(1);

        const { rows: [reserva] } = await pool.query(
            'SELECT status FROM reservas WHERE id = $1', [seed.reserva.id]
        );
        expect(reserva.status).toBe('cancelada');

        const { rows: [pag] } = await pool.query(
            'SELECT status FROM pagamentos WHERE id = $1', [seed.pagamento.id]
        );
        expect(pag.status).toBe('cancelado');

        // Regressão: a vaga NÃO pode ficar presa em 'reservada'
        const { rows: [vaga] } = await pool.query(
            'SELECT status, reserva_id_ativa FROM vagas WHERE id = $1', [seed.vaga.id]
        );
        expect(vaga.status).toBe('livre');
        expect(vaga.reserva_id_ativa).toBeNull();
    });

    test('reserva pendente com horário de entrada vencido expira e libera a vaga', async () => {
        if (!dbAvailable) return;
        seed = await seedReservaComPagamento({
            suffix: `venc_${Date.now()}`,
            dataEntrada: "NOW() - INTERVAL '1 hour'",
        });
        // Sem pagamento pendente de PIX para não cair na outra rotina
        await pool.query("UPDATE pagamentos SET status = 'cancelado' WHERE id = $1", [seed.pagamento.id]);

        const reservaMaintenanceService = require('../../services/reservaMaintenanceService');
        const { expired } = await reservaMaintenanceService.expirarReservasPendentes();
        expect(expired).toBeGreaterThanOrEqual(1);

        const { rows: [reserva] } = await pool.query(
            'SELECT status FROM reservas WHERE id = $1', [seed.reserva.id]
        );
        expect(reserva.status).toBe('expirada');

        const { rows: [vaga] } = await pool.query(
            'SELECT status, reserva_id_ativa FROM vagas WHERE id = $1', [seed.vaga.id]
        );
        expect(vaga.status).toBe('livre');
        expect(vaga.reserva_id_ativa).toBeNull();
    });
});
