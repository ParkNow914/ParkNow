// utils/escapeHtml.js
// Escapa texto para inserção em HTML (corpo e atributos entre aspas).
// Usar SEMPRE que um dado vindo do usuário entra em template de e-mail ou HTML.

const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"']/g, (c) => MAPA[c]);
}

/** Copia o objeto escapando os campos indicados. */
function escaparCampos(obj, campos) {
    const copia = { ...obj };
    for (const campo of campos) {
        if (copia[campo] !== undefined && copia[campo] !== null) copia[campo] = escapeHtml(copia[campo]);
    }
    return copia;
}

module.exports = { escapeHtml, escaparCampos };
