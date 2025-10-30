const NodeCache = require('node-cache');
const logger = require('../utils/logger');

class DomainCacheService {
    constructor(ttlSeconds = 3600) {
        this.cache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: ttlSeconds * 0.2,
            useClones: false
        });
    }

    get(domain) {
        return this.cache.get(domain);
    }

    set(domain, data, ttl) {
        return this.cache.set(domain, data, ttl || this.cache.options.stdTTL);
    }

    has(domain) {
        return this.cache.has(domain);
    }

    stats() {
        return this.cache.getStats();
    }

    flush() {
        this.cache.flushAll();
    }
}

// Exporta uma instância singleton
module.exports = new DomainCacheService(process.env.DOMAIN_CACHE_TTL || 3600);
