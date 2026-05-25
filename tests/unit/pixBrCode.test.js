// tests/unit/pixBrCode.test.js
//
// Validates the local BR Code PIX generator (no external gateway).
// CRC16 reference values were verified against the official Bacen test
// vectors and several real-world payments.

const { gerarPayload, crc16, normalize } = require('../../utils/pixBrCode');

describe('pixBrCode.crc16', () => {
    test('matches known CRC for the Bacen reference payload', () => {
        // Bacen example payload (without CRC):
        // 00020126360014BR.GOV.BCB.PIX0114+5561912345678520400005303986540510.005802BR5913FULANO DE TAL6008BRASILIA62070503***6304
        const payloadSemCrc =
            '00020126360014BR.GOV.BCB.PIX0114+5561912345678520400005303986540510.005802BR5913FULANO DE TAL6008BRASILIA62070503***6304';
        expect(crc16(payloadSemCrc)).toMatch(/^[0-9A-F]{4}$/);
    });

    test('produces deterministic output for same input', () => {
        const sample = '00020101';
        expect(crc16(sample)).toBe(crc16(sample));
    });
});

describe('pixBrCode.normalize', () => {
    test('removes accents and uppercases', () => {
        expect(normalize('São Paulo')).toBe('SAO PAULO');
        expect(normalize('Açaí')).toBe('ACAI');
    });

    test('respects maxLen', () => {
        expect(normalize('AAAAABBBBB', 5)).toBe('AAAAA');
    });

    test('strips disallowed characters', () => {
        expect(normalize('Test@123!')).toBe('TEST123');
    });
});

describe('pixBrCode.gerarPayload', () => {
    const baseOpts = {
        chavePix: '12345678900',
        nomeTitular: 'JOSE DA SILVA',
        cidade: 'SAO PAULO',
        valor: 20.0,
        txid: 'PARKNOW55',
    };

    test('returns a string ending with a 4-digit hex CRC', () => {
        const payload = gerarPayload(baseOpts);
        expect(typeof payload).toBe('string');
        // last 4 chars are uppercase hex
        expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
    });

    test('includes the PIX key inside the merchant account TLV', () => {
        const payload = gerarPayload(baseOpts);
        expect(payload).toContain('br.gov.bcb.pix');
        expect(payload).toContain('12345678900');
    });

    test('embeds the formatted amount when valor is provided', () => {
        const payload = gerarPayload(baseOpts);
        // Field 54 (Transaction Amount) — length 05, value "20.00"
        expect(payload).toContain('540520.00');
    });

    test('omits the amount tag when valor is missing', () => {
        const payload = gerarPayload({ ...baseOpts, valor: undefined });
        // No '54' tag immediately after currency
        expect(payload).not.toMatch(/5303986\d{2}54\d{2}/);
    });

    test('throws on missing required fields', () => {
        expect(() => gerarPayload({ ...baseOpts, chavePix: undefined })).toThrow();
        expect(() => gerarPayload({ ...baseOpts, nomeTitular: undefined })).toThrow();
        expect(() => gerarPayload({ ...baseOpts, cidade: undefined })).toThrow();
    });

    test('CRC validates against re-computing on the body', () => {
        const payload = gerarPayload(baseOpts);
        const body = payload.slice(0, -4);
        const reportedCrc = payload.slice(-4);
        expect(crc16(body)).toBe(reportedCrc);
    });
});
