// utils/uploadSecurity.js
// Validação de conteúdo real de uploads (magic bytes) + sanitização de imagem.
//
// O filtro do Multer confia no mimetype declarado pelo CLIENTE — um atacante
// pode enviar qualquer payload com Content-Type de imagem. Aqui validamos os
// primeiros bytes do ARQUIVO e, para imagens, re-encodamos via sharp, o que:
//   1. garante que o arquivo é uma imagem decodificável de verdade;
//   2. remove TODOS os metadados (EXIF/GPS — privacidade do usuário);
//   3. normaliza o formato (JPEG), neutralizando payloads poliglotas.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { BadRequestError } = require('./AppError');
const logger = require('./logger');

const SIGNATURES = [
    { type: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
    { type: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { type: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
    { type: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    // WEBP: RIFF....WEBP (bytes 0-3 e 8-11)
    { type: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];

/**
 * Detecta o tipo real do arquivo pelos primeiros bytes.
 * @param {string} filePath
 * @returns {Promise<'jpeg'|'png'|'gif'|'webp'|'pdf'|null>}
 */
async function sniffFileType(filePath) {
    const fd = await fs.promises.open(filePath, 'r');
    try {
        const header = Buffer.alloc(16);
        await fd.read(header, 0, 16, 0);
        for (const sig of SIGNATURES) {
            const matches = sig.bytes.every((b, i) => header[i] === b);
            if (!matches) continue;
            if (sig.extra && !sig.extra.bytes.every((b, i) => header[sig.extra.offset + i] === b)) {
                continue;
            }
            return sig.type;
        }
        return null;
    } finally {
        await fd.close();
    }
}

/**
 * Calcula o SHA-256 do arquivo (usado no anti-duplicação de comprovantes).
 * @param {string} filePath
 * @returns {Promise<string>} hash hex
 */
function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(filePath)
            .on('error', reject)
            .on('data', (chunk) => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')));
    });
}

/**
 * Valida e sanitiza um upload de comprovante:
 *  - confere magic bytes (imagem ou PDF);
 *  - imagens são re-encodadas para JPEG via sharp (remove EXIF/GPS, valida
 *    que decodifica de verdade) — o arquivo original é substituído;
 *  - PDFs passam apenas pela checagem de assinatura.
 *
 * Em caso de conteúdo inválido o arquivo é removido e BadRequestError é lançada.
 *
 * @param {object} file - req.file do multer ({ path, originalname, ... })
 * @returns {Promise<{ path: string, realType: string, sha256: string }>}
 */
async function sanitizeComprovanteUpload(file) {
    const realType = await sniffFileType(file.path);

    if (!realType) {
        await fs.promises.unlink(file.path).catch(() => {});
        throw new BadRequestError(
            'Conteúdo do arquivo inválido: envie uma imagem (JPG/PNG/WEBP/GIF) ou PDF reais.'
        );
    }

    let finalPath = file.path;

    if (realType !== 'pdf') {
        // Re-encoda a imagem: valida decodificação, remove metadados e normaliza
        const sanitizedPath = `${file.path.replace(/\.[^.]*$/, '')}-sanitized.jpg`;
        try {
            await sharp(file.path)
                .rotate() // aplica a orientação EXIF antes de descartá-la
                .jpeg({ quality: 90 })
                .toFile(sanitizedPath);
        } catch (err) {
            await fs.promises.unlink(file.path).catch(() => {});
            await fs.promises.unlink(sanitizedPath).catch(() => {});
            logger.warn('[uploadSecurity] Imagem não decodificável rejeitada', {
                original: path.basename(file.path),
                error: err.message,
            });
            throw new BadRequestError('A imagem enviada está corrompida ou não é uma imagem válida.');
        }
        await fs.promises.unlink(file.path).catch(() => {});
        finalPath = sanitizedPath;
    }

    const sha256 = await hashFile(finalPath);
    return { path: finalPath, realType, sha256 };
}

module.exports = {
    sniffFileType,
    hashFile,
    sanitizeComprovanteUpload,
};
