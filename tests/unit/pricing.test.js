// tests/unit/pricing.test.js
// Preço da reserva calculado no servidor (auditoria C-01/C-02).
const { calcularValorReserva } = require('../../utils/pricing');

const est = { preco_hora: '10.00', preco_dia: '50.00' };
const t0 = new Date('2026-12-01T10:00:00Z');
const mais = (min) => new Date(t0.getTime() + min * 60 * 1000);

describe('calcularValorReserva', () => {
    test('cobra por hora iniciada, mínimo de 1 hora', () => {
        expect(calcularValorReserva({ entrada: t0, saida: mais(1), estacionamento: est }).valor).toBe(10);
        expect(calcularValorReserva({ entrada: t0, saida: mais(60), estacionamento: est }).valor).toBe(10);
        expect(calcularValorReserva({ entrada: t0, saida: mais(61), estacionamento: est }).valor).toBe(20);
    });

    test('ruído de milissegundos não cobra hora extra', () => {
        const umaHoraEUmMs = new Date(t0.getTime() + 60 * 60 * 1000 + 1);
        expect(calcularValorReserva({ entrada: t0, saida: umaHoraEUmMs, estacionamento: est }).valor).toBe(10);
    });

    test('limita cada bloco de 24h à diária', () => {
        // 6h a R$10 = R$60, mas a diária é R$50
        expect(calcularValorReserva({ entrada: t0, saida: mais(6 * 60), estacionamento: est }).valor).toBe(50);
        // 25h = 1 diária + 1 hora
        expect(calcularValorReserva({ entrada: t0, saida: mais(25 * 60), estacionamento: est }).valor).toBe(60);
    });

    test('usa as colunas legadas quando preco_* está vazio', () => {
        const legado = { preco_hora: null, valor_hora: '7.50', valor_diaria: null };
        expect(calcularValorReserva({ entrada: t0, saida: mais(120), estacionamento: legado }).valor).toBe(15);
    });

    test('não perde centavos com ponto flutuante', () => {
        const quebrado = { preco_hora: '0.10' };
        expect(calcularValorReserva({ entrada: t0, saida: mais(3 * 60), estacionamento: quebrado }).valor).toBe(0.3);
    });

    test('recusa período invertido, datas inválidas e estacionamento sem preço', () => {
        expect(() => calcularValorReserva({ entrada: t0, saida: mais(-60), estacionamento: est })).toThrow(/depois da entrada/);
        expect(() => calcularValorReserva({ entrada: t0, saida: t0, estacionamento: est })).toThrow(/depois da entrada/);
        expect(() => calcularValorReserva({ entrada: new Date('x'), saida: mais(60), estacionamento: est })).toThrow(/entrada inválida/);
        expect(() => calcularValorReserva({ entrada: t0, saida: mais(60), estacionamento: { preco_hora: 0 } })).toThrow(/tabela de preços/);
        expect(() => calcularValorReserva({ entrada: t0, saida: mais(60), estacionamento: { preco_hora: 'NaN' } })).toThrow(/tabela de preços/);
    });

    test('nunca devolve NaN, zero ou negativo', () => {
        for (const min of [1, 59, 60, 61, 1439, 1440, 1441, 10000]) {
            const { valor } = calcularValorReserva({ entrada: t0, saida: mais(min), estacionamento: est });
            expect(Number.isFinite(valor)).toBe(true);
            expect(valor).toBeGreaterThan(0);
        }
    });
});
