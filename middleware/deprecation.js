// middleware/deprecation.js
// Marca rotas legado com cabeçalhos de descontinuação seguindo RFC 8594
// (Deprecation, Sunset) e RFC 8288 (Link rel="deprecation").
//
// Uso:
//   const { deprecate } = require('../middleware/deprecation');
//   router.post('/foo', deprecate({ replacement: '/api/reservas/com-pagamento',
//                                   sunset: '2027-01-01' }), handler);
//
// Os cabeçalhos são puramente informativos — não alteram o status de resposta
// nem o corpo. Clientes modernos (browsers via DevTools, ferramentas de API)
// exibem-nos automaticamente. Também emitimos um log de aviso (uma vez por
// rota+IP, com cache TTL curto) para visibilidade no servidor.

const logger = require('../utils/logger');

// Cache simples para evitar inundar os logs: chave = `${route}::${ip}`.
const seen = new Map();
const SEEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const SEEN_MAX = 1000;

function rememberAndShouldLog(key) {
    const now = Date.now();
    // Limpeza preguiçosa
    if (seen.size > SEEN_MAX) {
        for (const [k, ts] of seen) {
            if (now - ts > SEEN_TTL_MS) seen.delete(k);
            if (seen.size <= SEEN_MAX / 2) break;
        }
    }
    const last = seen.get(key);
    if (last && now - last < SEEN_TTL_MS) return false;
    seen.set(key, now);
    return true;
}

/**
 * Cria um middleware Express que adiciona cabeçalhos de deprecação.
 *
 * @param {Object} opts
 * @param {string} [opts.replacement] - Rota substituta (ex: '/api/reservas/com-pagamento').
 *        Emitida como `Link: <replacement>; rel="successor-version"`.
 * @param {string} [opts.sunset] - Data ISO (YYYY-MM-DD) após a qual a rota será removida.
 *        Emitida como `Sunset: <HTTP-date>`.
 * @param {string} [opts.docs] - URL de documentação adicional.
 *        Emitida como `Link: <docs>; rel="deprecation"`.
 * @param {boolean} [opts.logOnce=true] - Loga aviso uma vez por (rota, IP).
 * @returns {Function} middleware Express
 */
function deprecate(opts = {}) {
    const { replacement, sunset, docs, logOnce = true } = opts;

    // Pré-formata o Sunset uma vez (RFC 8594 usa HTTP-date / RFC 7231).
    let sunsetHeader = null;
    if (sunset) {
        const d = new Date(sunset);
        if (!Number.isNaN(d.getTime())) {
            sunsetHeader = d.toUTCString();
        }
    }

    // Monta o cabeçalho Link uma vez.
    const linkParts = [];
    if (replacement) linkParts.push(`<${replacement}>; rel="successor-version"`);
    if (docs) linkParts.push(`<${docs}>; rel="deprecation"; type="text/html"`);
    const linkHeader = linkParts.length > 0 ? linkParts.join(', ') : null;

    return function deprecationMiddleware(req, res, next) {
        // RFC 8594 §2: `Deprecation: true` é a forma mínima conforme.
        res.setHeader('Deprecation', 'true');
        if (sunsetHeader) res.setHeader('Sunset', sunsetHeader);
        if (linkHeader) res.setHeader('Link', linkHeader);

        if (logOnce) {
            const ip = req.ip || req.connection?.remoteAddress || 'unknown';
            const key = `${req.method} ${req.originalUrl || req.url}::${ip}`;
            if (rememberAndShouldLog(key)) {
                logger.warn('[deprecation] Endpoint legado acessado', {
                    method: req.method,
                    path: req.originalUrl || req.url,
                    ip,
                    requestId: req.id,
                    replacement: replacement || null,
                    sunset: sunset || null,
                });
            }
        }

        next();
    };
}

module.exports = { deprecate, _clearCache: () => seen.clear() };
