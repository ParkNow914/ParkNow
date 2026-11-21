// utils/logSafe.js
// Neutraliza valores vindos do usuário antes de entrarem em mensagens de log
// (evita log injection: quebras de linha forjando entradas falsas).

// \n, \r, LINE SEPARATOR (U+2028) e PARAGRAPH SEPARATOR (U+2029).
const QUEBRAS_DE_LINHA = new RegExp('[' + String.fromCharCode(10, 13, 0x2028, 0x2029) + ']', 'g');

function logSafe(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/\n|\r/g, ' ').replace(QUEBRAS_DE_LINHA, ' ').slice(0, 300);
}

module.exports = { logSafe };
