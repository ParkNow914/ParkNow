// tests/unit/refreshTokenHash.test.js
// Auditoria A-01: com bcrypt (que só lê 72 bytes) um refresh token antigo
// continuava válido depois da rotação. O hash SHA-256 compara o token inteiro.
const jwt = require('jsonwebtoken');
const { hashRefreshToken, verifyRefreshTokenAgainstHash } = require('../../utils/tokenUtils');

const SECRET = 'x'.repeat(64);
const emitir = (jti) =>
    jwt.sign({ userId: 42, type: 'user', tokenType: 'refresh', jti }, SECRET, { expiresIn: '7d' });

describe('hash do refresh token', () => {
    test('tokens do mesmo usuário compartilham os 72 primeiros bytes (motivo da troca)', () => {
        const a = emitir('aaaa-1');
        const b = emitir('bbbb-2');
        expect(a).not.toBe(b);
        expect(a.slice(0, 72)).toBe(b.slice(0, 72));
    });

    test('token antigo NÃO valida contra o hash do token rotacionado', () => {
        const antigo = emitir('aaaa-1');
        const novo = emitir('bbbb-2');
        const hashDoNovo = hashRefreshToken(novo);
        expect(verifyRefreshTokenAgainstHash(novo, hashDoNovo)).toBe(true);
        expect(verifyRefreshTokenAgainstHash(antigo, hashDoNovo)).toBe(false);
    });

    test('recusa hash no formato antigo (bcrypt) e entradas vazias', () => {
        const t = emitir('c');
        expect(verifyRefreshTokenAgainstHash(t, '$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
        expect(verifyRefreshTokenAgainstHash('', hashRefreshToken(t))).toBe(false);
        expect(verifyRefreshTokenAgainstHash(t, null)).toBe(false);
    });
});
