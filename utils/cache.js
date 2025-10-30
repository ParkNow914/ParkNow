// utils/cache.js
// Implementação de cache simples em memória usando node-cache.

const NodeCache = require('node-cache');
const logger = require('./logger');
const config = require('../config');

// Configurações do Cache
const defaultTTL = config.cache.defaultTTL || 60; // TTL padrão em segundos
const checkPeriod = config.cache.checkperiod || 120; // Intervalo de verificação

// Cria a instância do cache
const appCache = new NodeCache({ stdTTL: defaultTTL, checkperiod: checkPeriod, useClones: false });

logger.info(`[Cache] Cache na memória inicializado (TTL Padrão: ${defaultTTL}s, Check: ${checkPeriod}s).`);

/**
 * Obtém um valor do cache pela chave.
 * @param {string} key - A chave única.
 * @returns {*} Valor cacheado ou undefined.
 */
const get = (key) => {
    const value = appCache.get(key);
    if (value) logger.debug(`[Cache] HIT para chave: ${key}`);
    else logger.debug(`[Cache] MISS para chave: ${key}`);
    return value;
};

/**
 * Define (ou atualiza) um valor no cache com TTL.
 * @param {string} key - A chave única.
 * @param {*} value - O valor a ser armazenado.
 * @param {number} [ttl] - TTL em segundos. Usa o padrão da config ou do cache se omitido.
 * @returns {boolean} true se definido com sucesso.
 */
const set = (key, value, ttl) => {
    const finalTTL = ttl || config.cache[`${key}_ttl`] || defaultTTL; // Prioridade: ttl arg -> config específica -> config padrão
    logger.debug(`[Cache] SET para chave: ${key} (TTL: ${finalTTL}s)`);
    if (value === undefined || value === null) {
         logger.warn(`[Cache] SET abortado (valor nulo/undefined) para chave: ${key}.`);
         // Deletar a chave se o valor for nulo/undefined?
         // appCache.del(key);
         return false;
    }
    return appCache.set(key, value, finalTTL);
};

/**
 * Remove uma ou mais chaves do cache.
 * @param {string|string[]} keys - Chave(s) a serem removidas.
 * @returns {number} Número de chaves removidas.
 */
const del = (keys) => {
    const keysToRemove = Array.isArray(keys) ? keys : [keys];
    if(keysToRemove.length > 0) {
        logger.info(`[Cache] DEL para chave(s): ${keysToRemove.join(', ')}`);
        return appCache.del(keysToRemove);
    }
    return 0;
};

/** Limpa todo o cache. Use com cuidado! */
const flush = () => {
     logger.warn('[Cache] Cache FLUSH executado!');
    appCache.flushAll();
};

/** Obtém estatísticas do cache */
const getStats = () => appCache.getStats();

// --- Eventos do Cache (Opcional - para logging detalhado) ---
appCache.on('set', (key) => logger.verbose(`[Cache Evt] SET: ${key}`));
appCache.on('del', (key) => logger.verbose(`[Cache Evt] DEL: ${key}`));
appCache.on('expired', (key) => logger.info(`[Cache Evt] EXPIRED: ${key}`));
appCache.on('flush', () => logger.warn(`[Cache Evt] FLUSHED`));

module.exports = { get, set, del, flush, getStats, cacheInstance: appCache };