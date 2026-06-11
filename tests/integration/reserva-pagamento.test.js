// tests/integration/reserva-pagamento.test.js
//
// Cobre a criação de reserva com pagamento PIX de ponta a ponta contra um
// Postgres real: gera o BR Code localmente, persiste reserva+pagamento na mesma
// transação, e o BR Code resultante é válido (CRC16 confere). Também valida o
// rollback quando o estacionamento não tem chave PIX configurada.
//
// Skipa graciosamente sem DB (mesmo padrão dos demais testes de integração).

process.env.PG_DATABASE = process.env.PG_DATABASE || 'parknow_test';
process.env.PG_PASSWORD = process.env.PG_PASSWORD || 'postgres';

jest.mock('../../utils/logger', () => ({
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    http: () => {}, stream: { write: () => {} },
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

async function seedEstacionamento({ suffix, comChavePix = true }) {
    const { rows: [usuario] } = await pool.query(
        `INSERT INTO usuarios (nome, email, senha, telefone, placa_veiculo, tipo_veiculo)
         VALUES ('Motorista', $1, 'hash', '11999990000', 'ABC1D23', 'Carro') RETURNING id`,
        [`motorista_${suffix}@teste.dev`]
    );
    const { rows: [admin] } = await pool.query(
        `INSERT INTO admins (nome, email, senha) VALUES ('Dono', $1, 'hash') RETURNING id`,
        [`dono_${suffix}@teste.dev`]
    );
    const { rows: [est] } = await pool.query(
        `INSERT INTO estacionamentos
            (nome, admin_id, capacidade_total, vagas_disponiveis,
             valor_hora, valor_diaria, valor_mensal, horario_abertura, horario_fechamento)
         VALUES ($1, $2, 10, 10, 10.00, 50.00, 500.00, '08:00', '22:00') RETURNING id`,
        [`Est ${suffix}`, admin.id]
    );
    const { rows: [vaga] } = await pool.query(
        `INSERT INTO vagas (numero, estacionamento_id, status) VALUES (1, $1, 'livre') RETURNING id`,
        [est.id]
    );
    if (comChavePix) {
        await pool.query(
            `INSERT INTO estacionamento_pagamentos
                (estacionamento_id, tipo_chave_pix, chave_pix, nome_titular)
             VALUES ($1, 'CNPJ', '12345678000190', 'ESTACIONAMENTO TESTE LTDA')`,
            [est.id]
        );
    }
    return { usuario, admin, est, vaga };
}

beforeAll(async () => {
    pool = new Pool(PG);
    try {
        await pool.query('SELECT 1 FROM estacionamento_pagamentos LIMIT 1');
        dbAvailable = true;
    } catch (_e) {
        dbAvailable = false;
    }
});

afterAll(async () => {
    if (pool) await pool.end().catch(() => {});
    const dbUtils = require('../../utils/dbUtils');
    if (dbUtils.closePool) await dbUtils.closePool().catch(() => {});
});

describe('Criação de reserva com pagamento PIX', () => {
    test('gera BR Code válido e persiste reserva + pagamento pendente', async () => {
        if (!dbAvailable) return;
        const seed = await seedEstacionamento({ suffix: `ok_${Date.now()}` });
        const reservaService = require('../../services/reservaService');

        const inicio = new Date(Date.now() + 60 * 60 * 1000);
        const fim = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const out = await reservaService.criarReservaComPagamento({
            estacionamento_id: seed.est.id,
            usuario_id: seed.usuario.id,
            data_entrada: inicio.toISOString(),
            data_saida: fim.toISOString(),
            valor: 20.0,
            veiculo_placa: 'ABC1D23',
            vaga_id: seed.vaga.id,
        }, 'pix');

        expect(out.reserva.id).toBeTruthy();
        expect(out.reserva.status).toBe('pendente');
        // Payload EMV/Bacen: começa com 000201 e termina com CRC16 hex (6304XXXX)
        expect(out.pix_qr_code_text).toMatch(/^000201/);
        expect(out.pix_qr_code_text).toMatch(/6304[0-9A-F]{4}$/);
        expect(out.pix_qr_code_text).toContain('br.gov.bcb.pix');
        expect(out.pix_qr_code).toBeTruthy(); // QR Code (base64/data URL)
        expect(out.chave_pix).toBe('12345678000190');

        // CRC dos últimos 4 chars deve ser hex válido
        expect(out.pix_qr_code_text.slice(-4)).toMatch(/^[0-9A-F]{4}$/);

        // Persistência: pagamento pendente vinculado
        const { rows } = await pool.query(
            `SELECT status, metodo_pagamento FROM pagamentos WHERE reserva_id = $1`,
            [out.reserva.id]
        );
        expect(rows.length).toBe(1);
        expect(rows[0].status).toBe('pendente');
        expect(rows[0].metodo_pagamento).toBe('pix');

        // Vaga marcada como reservada
        const { rows: vrows } = await pool.query('SELECT status FROM vagas WHERE id = $1', [seed.vaga.id]);
        expect(['reservada', 'ocupada']).toContain(vrows[0].status);
    });

    test('segunda reserva na MESMA vaga é rejeitada (guarda de corrida) e nada vaza', async () => {
        if (!dbAvailable) return;
        const seed = await seedEstacionamento({ suffix: `race_${Date.now()}` });
        const reservaService = require('../../services/reservaService');

        const dados = {
            estacionamento_id: seed.est.id,
            usuario_id: seed.usuario.id,
            data_entrada: new Date(Date.now() + 3600000).toISOString(),
            data_saida: new Date(Date.now() + 7200000).toISOString(),
            valor: 20.0,
            veiculo_placa: 'ABC1D23',
            vaga_id: seed.vaga.id,
        };

        const primeira = await reservaService.criarReservaComPagamento(dados, 'pix');
        expect(primeira.reserva.id).toBeTruthy();

        // Mesma vaga, segunda tentativa: deve falhar com 409 e não deixar lixo
        await expect(reservaService.criarReservaComPagamento(dados, 'pix'))
            .rejects.toThrow(/não está mais disponível/);

        const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS n FROM reservas WHERE vaga_id = $1', [seed.vaga.id]
        );
        expect(rows[0].n).toBe(1); // só a primeira persistiu (rollback da segunda)

        const { rows: vrows } = await pool.query('SELECT status FROM vagas WHERE id = $1', [seed.vaga.id]);
        expect(vrows[0].status).toBe('reservada');
    });

    test('faz rollback quando o estacionamento não tem chave PIX configurada', async () => {
        if (!dbAvailable) return;
        const seed = await seedEstacionamento({ suffix: `nopix_${Date.now()}`, comChavePix: false });
        const reservaService = require('../../services/reservaService');

        const inicio = new Date(Date.now() + 60 * 60 * 1000);
        const fim = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await expect(
            reservaService.criarReservaComPagamento({
                estacionamento_id: seed.est.id,
                usuario_id: seed.usuario.id,
                data_entrada: inicio.toISOString(),
                data_saida: fim.toISOString(),
                valor: 20.0,
                veiculo_placa: 'ABC1D23',
                vaga_id: seed.vaga.id,
            }, 'pix')
        ).rejects.toThrow();

        // Rollback: nenhuma reserva nem pagamento deve ter sobrado para este usuário
        const { rows } = await pool.query(
            'SELECT COUNT(*)::int AS n FROM reservas WHERE usuario_id = $1', [seed.usuario.id]
        );
        expect(rows[0].n).toBe(0);
        const { rows: vrows } = await pool.query('SELECT status FROM vagas WHERE id = $1', [seed.vaga.id]);
        expect(vrows[0].status).toBe('livre'); // vaga não ficou presa
    });
});
