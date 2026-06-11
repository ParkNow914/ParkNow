// tests/unit/uploadSecurity.test.js
//
// Valida a detecção de tipo real por magic bytes, a sanitização de imagem
// (re-encode que remove EXIF) e a rejeição de payloads disfarçados.

jest.mock('../../utils/logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {
    sniffFileType,
    hashFile,
    sanitizeComprovanteUpload,
} = require('../../utils/uploadSecurity');

const tmpFiles = [];
function tmpFile(name, content) {
    const p = path.join(os.tmpdir(), `upsec-${Date.now()}-${name}`);
    fs.writeFileSync(p, content);
    tmpFiles.push(p);
    return p;
}

afterAll(() => {
    for (const f of tmpFiles) {
        try { fs.unlinkSync(f); } catch (_e) { /* já removido pelo sanitize */ }
    }
});

describe('sniffFileType', () => {
    test('detecta JPEG/PNG/GIF/PDF/WEBP pelos bytes reais', async () => {
        expect(await sniffFileType(tmpFile('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])))).toBe('jpeg');
        expect(await sniffFileType(tmpFile('a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])))).toBe('png');
        expect(await sniffFileType(tmpFile('a.gif', Buffer.from('GIF89a....')))).toBe('gif');
        expect(await sniffFileType(tmpFile('a.pdf', Buffer.from('%PDF-1.7\n...')))).toBe('pdf');
        const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
        expect(await sniffFileType(tmpFile('a.webp', webp))).toBe('webp');
    });

    test('retorna null para conteúdo desconhecido (ex: script disfarçado de .jpg)', async () => {
        expect(await sniffFileType(tmpFile('fake.jpg', Buffer.from('<script>alert(1)</script>')))).toBeNull();
        expect(await sniffFileType(tmpFile('elf.jpg', Buffer.from([0x7f, 0x45, 0x4c, 0x46])))).toBeNull();
    });
});

describe('sanitizeComprovanteUpload', () => {
    test('rejeita arquivo com conteúdo que não é imagem nem PDF (e o remove)', async () => {
        const p = tmpFile('payload.jpg', Buffer.from('#!/bin/sh\nrm -rf /'));
        await expect(sanitizeComprovanteUpload({ path: p })).rejects.toThrow(/Conteúdo do arquivo inválido/);
        expect(fs.existsSync(p)).toBe(false);
    });

    test('rejeita "imagem" com assinatura JPEG mas corpo não decodificável', async () => {
        const p = tmpFile('broken.jpg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('lixo')]));
        await expect(sanitizeComprovanteUpload({ path: p })).rejects.toThrow(/corrompida/);
        expect(fs.existsSync(p)).toBe(false);
    });

    test('imagem real é re-encodada para JPEG sem metadados (EXIF removido)', async () => {
        // Gera um PNG real com sharp
        const original = path.join(os.tmpdir(), `upsec-real-${Date.now()}.png`);
        await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 200, b: 90 } } })
            .png()
            .toFile(original);
        tmpFiles.push(original);

        const result = await sanitizeComprovanteUpload({ path: original });
        tmpFiles.push(result.path);

        expect(result.path.endsWith('-sanitized.jpg')).toBe(true);
        expect(fs.existsSync(original)).toBe(false); // original substituído
        expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

        const meta = await sharp(result.path).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.exif).toBeUndefined(); // sem EXIF no resultado
    });

    test('PDF real passa apenas pela checagem de assinatura (não re-encoda)', async () => {
        const p = tmpFile('doc.pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'));
        const result = await sanitizeComprovanteUpload({ path: p });
        expect(result.realType).toBe('pdf');
        expect(result.path).toBe(p);
        expect(fs.existsSync(p)).toBe(true);
    });

    test('hashFile produz SHA-256 estável', async () => {
        const p = tmpFile('h.bin', Buffer.from('parknow'));
        const h1 = await hashFile(p);
        const h2 = await hashFile(p);
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });
});
