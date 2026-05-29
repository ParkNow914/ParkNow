// middleware/idempotency.js
//
// Idempotency-Key middleware (RFC draft "The Idempotency-Key HTTP Header Field").
//
// Clients pass `Idempotency-Key: <opaque>` to guarantee retries of the same
// logical request don't produce duplicate side effects.
//
// Sessão 2: agora suporta DOIS backends de store com a mesma interface:
//   - MemoryIdempotencyStore  (default em testes / fallback)
//   - PostgresIdempotencyStore (produção — persistente e multi-instância)
// A seleção é automática: em produção com pool disponível usa Postgres; em
// teste ou sem DB usa memória. O middleware é async e dá await no store
// (await de retorno síncrono também funciona, então memory store segue valendo).

const crypto = require('crypto');
const logger = require('../utils/logger');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const DEFAULT_MAX_ENTRIES = 5000;
const KEY_REGEX = /^[A-Za-z0-9_\-:.+/=]{8,255}$/;

// ─────────────────────── Memory store (default/teste) ───────────────────────
class MemoryIdempotencyStore {
    constructor({ maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS } = {}) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.entries = new Map();
    }
    _prune() {
        const now = Date.now();
        for (const [k, v] of this.entries) {
            if (v.expiresAt <= now) this.entries.delete(k);
            else break;
        }
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            this.entries.delete(oldest);
        }
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) { this.entries.delete(key); return undefined; }
        return entry;
    }
    setInProgress(key, fingerprint) {
        this._prune();
        this.entries.set(key, { status: 'in_progress', fingerprint, expiresAt: Date.now() + this.ttlMs });
    }
    setCompleted(key, payload) {
        const existing = this.entries.get(key) || {};
        this.entries.set(key, { ...existing, ...payload, status: 'completed', expiresAt: Date.now() + this.ttlMs });
    }
    delete(key) { this.entries.delete(key); }
}

// ─────────────────────── Postgres store (produção) ──────────────────────────
class PostgresIdempotencyStore {
    constructor(pool, { ttlMs = DEFAULT_TTL_MS } = {}) {
        this.pool = pool;
        this.ttlMs = ttlMs;
    }
    async get(key) {
        const { rows } = await this.pool.query(
            'SELECT fingerprint, status, status_code, body FROM idempotency_keys WHERE key = $1 AND expires_at > NOW()',
            [key]
        );
        if (rows.length === 0) return undefined;
        const r = rows[0];
        return {
            fingerprint: r.fingerprint,
            status: r.status,
            statusCode: r.status_code,
            body: typeof r.body === 'string' ? JSON.parse(r.body) : r.body,
        };
    }
    async setInProgress(key, fingerprint) {
        const expiresAt = new Date(Date.now() + this.ttlMs);
        await this.pool.query(
            `INSERT INTO idempotency_keys (key, fingerprint, status, expires_at)
             VALUES ($1, $2, 'in_progress', $3)
             ON CONFLICT (key) DO UPDATE SET fingerprint = $2, status = 'in_progress', expires_at = $3`,
            [key, fingerprint, expiresAt]
        );
        // limpeza oportunista
        this.pool.query('DELETE FROM idempotency_keys WHERE expires_at < NOW()').catch(() => {});
    }
    async setCompleted(key, payload) {
        const expiresAt = new Date(Date.now() + this.ttlMs);
        await this.pool.query(
            `UPDATE idempotency_keys
             SET status = 'completed', status_code = $2, body = $3, fingerprint = COALESCE($4, fingerprint), expires_at = $5
             WHERE key = $1`,
            [key, payload.statusCode || 200, JSON.stringify(payload.body ?? null), payload.fingerprint || null, expiresAt]
        );
    }
    async delete(key) {
        await this.pool.query('DELETE FROM idempotency_keys WHERE key = $1', [key]);
    }
}

const defaultStore = new MemoryIdempotencyStore();
let resolvedStore = null;

// Escolhe o store: Postgres em produção (se houver pool), memória caso contrário.
function pickStore() {
    if (resolvedStore) return resolvedStore;
    if (process.env.NODE_ENV === 'test') { resolvedStore = defaultStore; return resolvedStore; }
    try {
        const { pool } = require('../utils/dbUtils');
        if (pool) {
            resolvedStore = new PostgresIdempotencyStore(pool);
            logger.info('[idempotency] usando store Postgres');
            return resolvedStore;
        }
    } catch (_e) { /* cai pra memory */ }
    resolvedStore = defaultStore;
    return resolvedStore;
}

function buildFingerprint(req) {
    const hash = crypto.createHash('sha256');
    hash.update(req.method);
    hash.update('|');
    hash.update(req.originalUrl || req.url);
    hash.update('|');
    const principal = req.user?.id || req.admin?.id || req.ip || 'anon';
    hash.update(String(principal));
    hash.update('|');
    try { hash.update(JSON.stringify(req.body || {})); }
    catch (_e) { hash.update('[unstringifiable-body]'); }
    return hash.digest('hex');
}

/**
 * Factory do middleware. `store` pode ser injetado (testes); senão usa pickStore().
 */
function idempotency({ store = null, required = false } = {}) {
    return async function idempotencyMiddleware(req, res, next) {
        const key = req.get('Idempotency-Key');
        if (!key) {
            if (required) return res.status(400).json({ success: false, error: 'idempotency_key_required' });
            return next();
        }
        if (!KEY_REGEX.test(key)) {
            return res.status(400).json({ success: false, error: 'invalid_idempotency_key' });
        }

        const activeStore = store || pickStore();
        const fingerprint = buildFingerprint(req);

        let existing;
        try {
            existing = await activeStore.get(key);
        } catch (err) {
            // Se o store falhar (ex: DB momentaneamente fora), não bloqueia a request.
            logger.warn('[idempotency] store.get falhou, prosseguindo sem idempotência', { error: err.message });
            return next();
        }

        if (existing) {
            if (existing.fingerprint && existing.fingerprint !== fingerprint) {
                logger.warn('[idempotency] key reuse com body diferente', { requestId: req.id, key });
                return res.status(422).json({ success: false, error: 'idempotency_key_mismatch' });
            }
            if (existing.status === 'in_progress') {
                return res.status(409).json({ success: false, error: 'idempotency_in_progress' });
            }
            if (existing.status === 'completed') {
                res.set('Idempotent-Replay', 'true');
                return res.status(existing.statusCode || 200).json(existing.body);
            }
        }

        try {
            await activeStore.setInProgress(key, fingerprint);
        } catch (err) {
            logger.warn('[idempotency] store.setInProgress falhou, prosseguindo', { error: err.message });
            return next();
        }

        const originalJson = res.json.bind(res);
        let captured = false;
        res.json = (body) => {
            if (!captured) {
                captured = true;
                Promise.resolve(activeStore.setCompleted(key, { fingerprint, statusCode: res.statusCode, body }))
                    .catch((err) => logger.warn('[idempotency] setCompleted falhou', { error: err.message }));
            }
            return originalJson(body);
        };

        res.on('close', () => {
            if (!captured) {
                Promise.resolve(activeStore.delete(key)).catch(() => {});
            }
        });

        next();
    };
}

module.exports = idempotency;
module.exports.MemoryIdempotencyStore = MemoryIdempotencyStore;
module.exports.PostgresIdempotencyStore = PostgresIdempotencyStore;
module.exports.defaultStore = defaultStore;
