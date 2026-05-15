// middleware/idempotency.js
//
// Idempotency-Key middleware (RFC draft "The Idempotency-Key HTTP Header Field").
//
// Clients can pass an `Idempotency-Key: <opaque>` header to guarantee that
// retries of the same logical request don't produce duplicate side effects.
// We persist (key, methodPath, userScope) -> { status, body, completedAt }
// in an in-memory LRU with a TTL. The first request runs normally and the
// response is cached; subsequent requests within the TTL receive the cached
// response without re-executing the handler.
//
// In-memory storage is sufficient for a single-instance deployment. When
// scaling horizontally this should be backed by Redis / Postgres; the
// `store` parameter allows injecting that without changing handlers.

const crypto = require('crypto');
const logger = require('../utils/logger');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_ENTRIES = 5000;
const KEY_REGEX = /^[A-Za-z0-9_\-:.+/=]{8,255}$/;

class MemoryIdempotencyStore {
    constructor({ maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS } = {}) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.entries = new Map(); // insertion-ordered: oldest first
    }

    _prune() {
        const now = Date.now();
        // Drop expired entries (iterate from oldest).
        for (const [k, v] of this.entries) {
            if (v.expiresAt <= now) {
                this.entries.delete(k);
            } else {
                break; // map is roughly time-ordered; stop at first non-expired
            }
        }
        // Hard cap: evict oldest until under limit.
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            this.entries.delete(oldest);
        }
    }

    get(key) {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry;
    }

    setInProgress(key, fingerprint) {
        this._prune();
        this.entries.set(key, {
            status: 'in_progress',
            fingerprint,
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    setCompleted(key, payload) {
        const existing = this.entries.get(key) || {};
        this.entries.set(key, {
            ...existing,
            ...payload,
            status: 'completed',
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    delete(key) {
        this.entries.delete(key);
    }
}

const defaultStore = new MemoryIdempotencyStore();

/**
 * Build a fingerprint of the request to detect "same key, different body"
 * (which RFC says should be a 422).
 */
function buildFingerprint(req) {
    const hash = crypto.createHash('sha256');
    hash.update(req.method);
    hash.update('|');
    hash.update(req.originalUrl || req.url);
    hash.update('|');
    // user/admin id if authenticated, otherwise the IP
    const principal = req.user?.id || req.admin?.id || req.ip || 'anon';
    hash.update(String(principal));
    hash.update('|');
    try {
        hash.update(JSON.stringify(req.body || {}));
    } catch (_e) {
        hash.update('[unstringifiable-body]');
    }
    return hash.digest('hex');
}

/**
 * Factory returning the middleware. Use as:
 *   router.post('/path', idempotency(), handler)
 */
function idempotency({ store = defaultStore, required = false } = {}) {
    return function idempotencyMiddleware(req, res, next) {
        const key = req.get('Idempotency-Key');

        if (!key) {
            if (required) {
                return res
                    .status(400)
                    .json({ success: false, error: 'idempotency_key_required' });
            }
            return next();
        }

        if (!KEY_REGEX.test(key)) {
            return res
                .status(400)
                .json({ success: false, error: 'invalid_idempotency_key' });
        }

        const fingerprint = buildFingerprint(req);
        const existing = store.get(key);

        if (existing) {
            if (existing.fingerprint && existing.fingerprint !== fingerprint) {
                logger.warn('[idempotency] key reuse with different body', {
                    requestId: req.id,
                    key,
                });
                return res
                    .status(422)
                    .json({ success: false, error: 'idempotency_key_mismatch' });
            }
            if (existing.status === 'in_progress') {
                // Another request with the same key is still running.
                return res
                    .status(409)
                    .json({ success: false, error: 'idempotency_in_progress' });
            }
            if (existing.status === 'completed') {
                res.set('Idempotent-Replay', 'true');
                return res.status(existing.statusCode || 200).json(existing.body);
            }
        }

        store.setInProgress(key, fingerprint);

        // Capture the response so we can cache it.
        const originalJson = res.json.bind(res);
        let captured = false;
        res.json = (body) => {
            if (!captured) {
                captured = true;
                try {
                    store.setCompleted(key, {
                        fingerprint,
                        statusCode: res.statusCode,
                        body,
                    });
                } catch (err) {
                    logger.warn('[idempotency] failed to cache response', {
                        error: err.message,
                    });
                }
            }
            return originalJson(body);
        };

        // If the request errored before producing a JSON response, drop the
        // in-progress marker so retries are possible.
        res.on('close', () => {
            if (!captured) {
                store.delete(key);
            }
        });

        next();
    };
}

module.exports = idempotency;
module.exports.MemoryIdempotencyStore = MemoryIdempotencyStore;
module.exports.defaultStore = defaultStore;
