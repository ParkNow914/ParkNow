// utils/pixBrCode.js
//
// Gera um payload PIX "copia-e-cola" (BR Code estático) seguindo o padrão
// EMV/Bacen — sem depender de gateway externo. Tudo roda local.
//
// Especificação: Manual de Padrões para Iniciação do PIX (Bacen), seções
// 4.1 (Payload Format) e 4.2 (CRC16-CCITT-FALSE).
//
// Uso:
//   const { gerarPayloadPix } = require('./utils/pixBrCode');
//   const { payload, qrCodeImageBase64 } = await gerarPayloadPix({
//       chavePix: '12345678900',
//       nomeTitular: 'JOSE DA SILVA',
//       cidade: 'SAO PAULO',
//       valor: 20.00,
//       txid: 'PARKNOW123',
//       descricao: 'Reserva #55'
//   });

const QRCode = require('qrcode');

/** Monta um campo TLV (Tag-Length-Value) onde length é em 2 dígitos zero-padded. */
function tlv(id, value) {
    const v = String(value);
    const len = v.length.toString().padStart(2, '0');
    return `${id}${len}${v}`;
}

/**
 * CRC16-CCITT-FALSE conforme exigido pelo BR Code.
 * Polinômio 0x1021, valor inicial 0xFFFF, sem reflexão, sem XOR final.
 */
function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Normaliza string para o BR Code: remove acentos, força maiúsculo, limita tamanho.
 * O padrão Bacen aceita ASCII; acentos costumam quebrar leitura em alguns bancos.
 */
function normalize(value, maxLen) {
    const ascii = String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove combining diacritics
        .toUpperCase()
        .replace(/[^A-Z0-9 .,;:\-_/]/g, '');
    return maxLen ? ascii.slice(0, maxLen) : ascii;
}

/**
 * Gera o payload BR Code PIX estático (copia-e-cola).
 *
 * @param {object} opts
 * @param {string} opts.chavePix    Chave PIX do recebedor (CPF/CNPJ só dígitos, email, telefone +55…, ou aleatória UUID).
 * @param {string} opts.nomeTitular Nome do titular (max 25 chars).
 * @param {string} opts.cidade      Cidade do titular (max 15 chars).
 * @param {number} [opts.valor]     Valor em reais. Se omitido, gera cobrança "valor a definir".
 * @param {string} [opts.txid]      Identificador da transação (max 25 chars alfanuméricos). Default '***'.
 * @param {string} [opts.descricao] Descrição opcional incluída no campo 26.02 (max 50 chars).
 * @returns {string} payload pronto para QR Code / copia-e-cola
 */
function gerarPayload({ chavePix, nomeTitular, cidade, valor, txid = '***', descricao }) {
    if (!chavePix) throw new Error('chavePix é obrigatório');
    if (!nomeTitular) throw new Error('nomeTitular é obrigatório');
    if (!cidade) throw new Error('cidade é obrigatório');

    // Campo 26: Merchant Account Information — PIX
    let merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', String(chavePix).trim());
    if (descricao) {
        merchantAccount += tlv('02', normalize(descricao, 50));
    }

    // Campo 62: Additional Data Field — TXID
    const txidNorm = normalize(txid, 25) || '***';
    const additionalData = tlv('05', txidNorm);

    let payload = '';
    payload += tlv('00', '01');                         // Payload Format Indicator
    payload += tlv('26', merchantAccount);              // Merchant Account
    payload += tlv('52', '0000');                       // Merchant Category Code
    payload += tlv('53', '986');                        // Currency (BRL)
    if (typeof valor === 'number' && valor > 0) {
        payload += tlv('54', valor.toFixed(2));         // Transaction Amount
    }
    payload += tlv('58', 'BR');                         // Country Code
    payload += tlv('59', normalize(nomeTitular, 25));   // Merchant Name
    payload += tlv('60', normalize(cidade, 15));        // Merchant City
    payload += tlv('62', additionalData);               // Additional Data
    payload += '6304';                                  // CRC16 tag + length (calculado abaixo)

    const checksum = crc16(payload);
    return payload + checksum;
}

/**
 * Gera o payload PIX + imagem QR Code base64 em uma única chamada.
 * @returns {Promise<{ payload: string, qrCodeImageBase64: string }>}
 */
async function gerarPayloadPix(opts) {
    const payload = gerarPayload(opts);
    const qrCodeImageBase64 = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
    });
    return { payload, qrCodeImageBase64 };
}

module.exports = {
    gerarPayload,
    gerarPayloadPix,
    crc16,           // exportado para testes
    normalize,       // exportado para testes
};
