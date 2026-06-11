// utils/pgRateLimitStore.js
// Store de rate limiting persistido no Postgres para express-rate-limit v7.
//
// Substitui o store em memória nos limiters críticos (login/registro/reset):
//   * sobrevive a restarts (um atacante não zera o contador derrubando o app);
//   * funciona com múltiplas instâncias (Fly machines > 1).
//
// Estratégia fail-open: se o banco estiver indisponível, a requisição é
// PERMITIDA (rate limit é defesa em profundidade; indisponibilidade do DB já
// derruba o resto do request de qualquer forma) — com log de aviso.

const { pool } = require('./dbUtils');
const logger = require('./logger');

let tableEnsured = false;
async function ensureTable() {
    if (tableEnsured) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS rate_limits (
            key        TEXT PRIMARY KEY,
            hits       INTEGER NOT NULL DEFAULT 0,
            expires_at TIMESTAMPTZ NOT NULL
        )
    `);
    tableEnsured = true;
}

class PgRateLimitStore {
    /**
     * @param {object} [opts]
     * @param {string} [opts.prefix] - Prefixo da chave (isola limiters distintos).
     */
    constructor({ prefix = 'rl' } = {}) {
        this.prefix = prefix;
        this.windowMs = 60000;
        // Chaves não são locais ao processo: válido para múltiplas instâncias.
        this.localKeys = false;
    }

    init(options) {
        this.windowMs = options.windowMs;
    }

    prefixKey(key) {
        return `${this.prefix}:${key}`;
    }

    async increment(key) {
        try {
            await ensureTable();
            const { rows } = await pool.query(
                `INSERT INTO rate_limits (key, hits, expires_at)
                 VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
                 ON CONFLICT (key) DO UPDATE SET
                     hits = CASE WHEN rate_limits.expires_at < NOW()
                                 THEN 1 ELSE rate_limits.hits + 1 END,
                     expires_at = CASE WHEN rate_limits.expires_at < NOW()
                                       THEN NOW() + ($2 * INTERVAL '1 millisecond')
                                       ELSE rate_limits.expires_at END
                 RETURNING hits, expires_at`,
                [this.prefixKey(key), this.windowMs]
            );
            // Limpeza oportunista (~1% das chamadas) de janelas expiradas
            if (Math.random() < 0.01) {
                pool.query('DELETE FROM rate_limits WHERE expires_at < NOW()').catch((err) =>
                    logger.warn('[pgRateLimit] limpeza falhou', { error: err.message })
                );
            }
            return { totalHits: rows[0].hits, resetTime: new Date(rows[0].expires_at) };
        } catch (err) {
            logger.warn('[pgRateLimit] increment falhou — permitindo requisição (fail-open)', {
                error: err.message,
            });
            return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
        }
    }

    async decrement(key) {
        try {
            await ensureTable();
            await pool.query(
                'UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1',
                [this.prefixKey(key)]
            );
        } catch (err) {
            logger.warn('[pgRateLimit] decrement falhou', { error: err.message });
        }
    }

    async resetKey(key) {
        try {
            await ensureTable();
            await pool.query('DELETE FROM rate_limits WHERE key = $1', [this.prefixKey(key)]);
        } catch (err) {
            logger.warn('[pgRateLimit] resetKey falhou', { error: err.message });
        }
    }
}

module.exports = { PgRateLimitStore };
