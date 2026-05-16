/**
 * Serviço de armazenamento temporário em memória
 * Armazena dados de solicitações de parceria até a aprovação
 */

const storage = new Map();
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 horas
const CLEANUP_INTERVAL = 60 * 60 * 1000; // Limpar a cada hora
let cleanupInterval;

// Iniciar limpeza periódica
function startCleanup() {
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(cleanupExpired, CLEANUP_INTERVAL);
  // Garantir que o intervalo seja limpo ao encerrar o processo
  process.on('exit', () => {
    if (cleanupInterval) clearInterval(cleanupInterval);
  });
}

// Limpar itens expirados
function cleanupExpired() {
  const now = Date.now();
  let count = 0;
  
  for (const [key, { expiresAt }] of storage.entries()) {
    if (expiresAt <= now) {
      storage.delete(key);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[TempStorage] Limpeza automática: ${count} itens expirados removidos`);
  }
}

// Iniciar a limpeza automaticamente
startCleanup();

/**
 * Valida os dados do estacionamento
 * @param {object} data - Dados do estacionamento
 * @throws {Error} Se os dados forem inválidos
 */
const validateParkingData = (data) => {
  if (!data || typeof data !== 'object') {
    throw new Error('Dados inválidos: objeto esperado');
  }

  // Validar campos obrigatórios
  const requiredFields = [
    { field: 'nome', type: 'string', min: 3, max: 100 },
    { field: 'email', type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    { field: 'senha', type: 'string', min: 8 },
    { field: 'nomeEstacionamento', type: 'string', min: 3, max: 200 },
    { field: 'enderecoEstacionamento', type: 'string', min: 10, max: 500 },
    { field: 'cnpj', type: 'string', pattern: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/ },
    { field: 'numeroVagas', type: 'number', min: 1, max: 1000 }
  ];

  const errors = [];
  const validatedData = {};

  for (const { field, type, min, max, pattern } of requiredFields) {
    const value = data[field];
    
    // Verificar se o campo existe
    if (value === undefined || value === null || value === '') {
      errors.push(`O campo '${field}' é obrigatório`);
      continue;
    }

    // Validar tipo
    if (type === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`O campo '${field}' deve ser um número`);
        continue;
      }
      validatedData[field] = numValue;
    } else {
      if (typeof value !== type) {
        errors.push(`O campo '${field}' deve ser do tipo ${type}`);
        continue;
      }
      validatedData[field] = value;
    }

    // Validar tamanho mínimo/máximo para strings
    if (type === 'string' && (min !== undefined || max !== undefined)) {
      const length = value.length;
      if (min !== undefined && length < min) {
        errors.push(`O campo '${field}' deve ter no mínimo ${min} caracteres`);
      }
      if (max !== undefined && length > max) {
        errors.push(`O campo '${field}' deve ter no máximo ${max} caracteres`);
      }
    }

    // Validar padrão (regex)
    if (pattern && !pattern.test(value)) {
      errors.push(`O campo '${field}' está em um formato inválido`);
    }
  }

  // Validar número de vagas (se for número)
  if (validatedData.numeroVagas !== undefined) {
    const vagas = Number(validatedData.numeroVagas);
    if (vagas < 1 || vagas > 1000) {
      errors.push('Número de vagas deve estar entre 1 e 1000');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Erros de validação: ${errors.join('; ')}`);
  }

  return validatedData;
};

/**
 * Armazena os dados de um estacionamento para aprovação
 * @param {string} key - Chave única para identificação
 * @param {object} value - Dados do estacionamento
 * @param {number} [ttl] - Tempo de vida em milissegundos (padrão: 7 dias)
 * @returns {boolean} true se armazenado com sucesso
 * @throws {Error} Se os dados forem inválidos
 */
const set = (key, value, ttl = DEFAULT_TTL) => {
  if (!key || typeof key !== 'string') {
    throw new Error('Chave inválida: deve ser uma string não vazia');
  }

  if (ttl <= 0) {
    throw new Error('TTL deve ser maior que zero');
  }
  
  try {
    // Validar os dados antes de armazenar (apenas campos obrigatórios)
    const _validatedData = validateParkingData(value);
    
    const now = Date.now();
    const expiresAt = now + ttl;
    
    // Limitar o número de itens armazenados para evitar vazamento de memória
    if (storage.size >= 1000) {
      // Remover os 10% mais antigos
      const entries = Array.from(storage.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, Math.max(1, Math.floor(storage.size * 0.1)));
      
      for (const [oldKey] of entries) {
        storage.delete(oldKey);
      }
      console.log(`[TempStorage] Limpeza de itens antigos: ${entries.length} itens removidos`);
    }
    
    // Armazenar TODOS os dados originais, não apenas os validados
    // A validação garante que os campos obrigatórios estão corretos
    storage.set(key, { 
      value: { 
        ...value, // Usar dados originais completos
        _createdAt: new Date().toISOString(),
        _expiresAt: new Date(expiresAt).toISOString()
      }, 
      expiresAt,
      accessCount: 0,
      lastAccessed: now
    });
    
    return true;
  } catch (error) {
    const errorMsg = `Erro ao armazenar dados temporários: ${error.message}`;
    console.error(`[TempStorage] ${errorMsg}`, { key, error: error.stack });
    throw new Error(errorMsg);
  }
};

/**
 * Obtém um valor do armazenamento
 * @param {string} key - Chave para buscar
 * @returns {any|null} - Valor armazenado ou null se não existir ou tiver expirado
 */
const get = (key) => {
  if (!storage.has(key)) {
    return null;
  }
  
  const entry = storage.get(key);
  const now = Date.now();
  
  // Verificar se expirou
  if (entry.expiresAt <= now) {
    storage.delete(key);
    return null;
  }
  
  // Atualizar contador de acesso e último acesso
  entry.accessCount = (entry.accessCount || 0) + 1;
  entry.lastAccessed = now;
  
  return entry.value;
};

/**
 * Remove um valor do armazenamento
 * @param {string} key - Chave para remover
 * @returns {boolean} - True se a chave existia e foi removida
 */
const del = (key) => {
  const exists = storage.has(key);
  storage.delete(key);
  return exists;
};

/**
 * Limpa todo o armazenamento
 */
const clear = () => {
  storage.clear();
};

/**
 * Verifica se uma chave existe e não expirou
 * @param {string} key - Chave para verificar
 * @returns {boolean} - True se a chave existe e não expirou
 */
const has = (key) => {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  if (!storage.has(key)) {
    return false;
  }
  
  const entry = storage.get(key);
  const now = Date.now();
  
  if (entry.expiresAt <= now) {
    storage.delete(key);
    return false;
  }
  
  return true;
};

/**
 * Método interno para depuração - retorna dados brutos do armazenamento
 * @param {string} key - Chave para buscar
 * @returns {object|null} - Dados brutos ou null se não existir
 */
const _getRaw = (key) => {
  return storage.get(key) || null;
};

// Método para estatísticas (usado apenas para monitoramento)
const getStats = () => ({
  totalItems: storage.size,
  oldestItem: storage.size > 0 
    ? new Date(Math.min(...Array.from(storage.values()).map(e => e.expiresAt)))
    : null,
  nextCleanup: cleanupInterval ? new Date(Date.now() + CLEANUP_INTERVAL) : null
});

module.exports = {
  set,
  get,
  del,
  clear,
  has,
  getStats,
  _getRaw, // Exportado apenas para depuração
  // Exportar para testes
  _test: {
    cleanupExpired,
    startCleanup,
    stopCleanup: () => {
      if (cleanupInterval) clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }
};
