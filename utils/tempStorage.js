/**
 * Armazenamento de solicitações de parceria pendentes de aprovação.
 *
 * Sessão 2: migrado de Map em memória → Postgres (tabela parceria_solicitacoes).
 * Mantém um cache/fallback em memória para o caso do banco estar indisponível,
 * de modo que a aplicação degrada graciosamente em vez de quebrar o cadastro.
 *
 * API agora é ASSÍNCRONA (set/get/del/has retornam Promise). Os callers são
 * handlers Express async e usam await.
 */

const logger = require('./logger');

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias
const memoryFallback = new Map(); // usado só se o DB falhar

// Carrega o pool de forma tolerante (evita ciclo de require em testes).
let pool = null;
function getPool() {
    if (pool) return pool;
    try {
        pool = require('./dbUtils').pool;
    } catch (_e) {
        pool = null;
    }
    return pool;
}

/**
 * Valida os dados obrigatórios do estacionamento antes de armazenar.
 * (Inalterado da versão anterior — garante integridade mínima.)
 */
const validateParkingData = (data) => {
    if (!data || typeof data !== 'object') {
        throw new Error('Dados inválidos: objeto esperado');
    }
    const requiredFields = [
        { field: 'nome', type: 'string', min: 3, max: 100 },
        { field: 'email', type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
        { field: 'senha', type: 'string', min: 8 },
        { field: 'nomeEstacionamento', type: 'string', min: 3, max: 200 },
        { field: 'enderecoEstacionamento', type: 'string', min: 10, max: 500 },
        { field: 'cnpj', type: 'string', pattern: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/ },
        { field: 'numeroVagas', type: 'number', min: 1, max: 1000 },
    ];
    const errors = [];
    for (const { field, type, min, max, pattern } of requiredFields) {
        const value = data[field];
        if (value === undefined || value === null || value === '') {
            errors.push(`O campo '${field}' é obrigatório`);
            continue;
        }
        if (type === 'number') {
            const n = Number(value);
            if (isNaN(n)) {
                errors.push(`O campo '${field}' deve ser um número`);
            } else {
                if (min !== undefined && n < min) errors.push(`'${field}' deve ser >= ${min}`);
                if (max !== undefined && n > max) errors.push(`'${field}' deve ser <= ${max}`);
            }
        } else {
            if (typeof value !== type) { errors.push(`O campo '${field}' deve ser ${type}`); continue; }
            if (min !== undefined && value.length < min) errors.push(`'${field}' mín ${min} caracteres`);
            if (max !== undefined && value.length > max) errors.push(`'${field}' máx ${max} caracteres`);
            if (pattern && !pattern.test(value)) errors.push(`'${field}' em formato inválido`);
        }
    }
    if (errors.length > 0) throw new Error(`Erros de validação: ${errors.join('; ')}`);
};

/**
 * Armazena uma solicitação. @returns {Promise<boolean>}
 */
const set = async (key, value, ttl = DEFAULT_TTL) => {
    if (!key || typeof key !== 'string') throw new Error('Chave inválida');
    if (ttl <= 0) throw new Error('TTL deve ser maior que zero');
    validateParkingData(value);

    const expiresAt = new Date(Date.now() + ttl);
    const payload = { ...value, _createdAt: new Date().toISOString(), _expiresAt: expiresAt.toISOString() };

    const p = getPool();
    if (p) {
        try {
            await p.query(
                `INSERT INTO parceria_solicitacoes (chave, dados, expires_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (chave) DO UPDATE SET dados = $2, expires_at = $3`,
                [key, JSON.stringify(payload), expiresAt]
            );
            // limpeza oportunista de expirados (best-effort, mas com log)
            p.query('DELETE FROM parceria_solicitacoes WHERE expires_at < NOW()').catch((err) =>
                logger.warn('[tempStorage] limpeza de expirados falhou', { error: err.message })
            );
            return true;
        } catch (err) {
            logger.error('[tempStorage] falha ao gravar no Postgres, usando fallback em memória', { error: err.message });
        }
    }
    memoryFallback.set(key, { value: payload, expiresAt: expiresAt.getTime() });
    return true;
};

/**
 * Recupera uma solicitação. @returns {Promise<object|null>}
 */
const get = async (key) => {
    const p = getPool();
    if (p) {
        try {
            const { rows } = await p.query(
                'SELECT dados, expires_at FROM parceria_solicitacoes WHERE chave = $1',
                [key]
            );
            if (rows.length > 0) {
                if (new Date(rows[0].expires_at).getTime() <= Date.now()) {
                    await del(key);
                    return null;
                }
                return typeof rows[0].dados === 'string' ? JSON.parse(rows[0].dados) : rows[0].dados;
            }
            // não achou no DB — tenta fallback
        } catch (err) {
            logger.error('[tempStorage] falha ao ler do Postgres, tentando memória', { error: err.message });
        }
    }
    const entry = memoryFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) { memoryFallback.delete(key); return null; }
    return entry.value;
};

/**
 * Remove uma solicitação. @returns {Promise<boolean>}
 */
const del = async (key) => {
    let existed = false;
    const p = getPool();
    if (p) {
        try {
            const { rowCount } = await p.query('DELETE FROM parceria_solicitacoes WHERE chave = $1', [key]);
            existed = rowCount > 0;
        } catch (err) {
            logger.error('[tempStorage] falha ao deletar no Postgres', { error: err.message });
        }
    }
    if (memoryFallback.delete(key)) existed = true;
    return existed;
};

/**
 * Verifica existência não expirada. @returns {Promise<boolean>}
 */
const has = async (key) => {
    if (!key || typeof key !== 'string') return false;
    return (await get(key)) !== null;
};

/**
 * Estatísticas (monitoramento). @returns {Promise<object>}
 */
const getStats = async () => {
    const p = getPool();
    if (p) {
        try {
            const { rows } = await p.query('SELECT COUNT(*)::int AS total FROM parceria_solicitacoes WHERE expires_at > NOW()');
            return { totalItems: rows[0].total, backend: 'postgres' };
        } catch (_e) { /* cai pro fallback */ }
    }
    return { totalItems: memoryFallback.size, backend: 'memory-fallback' };
};

const clear = async () => {
    const p = getPool();
    if (p) {
        try { await p.query('DELETE FROM parceria_solicitacoes'); } catch (_e) { /* ignore */ }
    }
    memoryFallback.clear();
};

module.exports = { set, get, del, has, getStats, clear, _validateParkingData: validateParkingData };
