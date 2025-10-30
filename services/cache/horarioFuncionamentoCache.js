const NodeCache = require('node-cache');
const logger = require('../../utils/logger');

// Cria uma nova instância do cache com TTL de 1 hora e verificação a cada 2 horas
const cache = new NodeCache({
  stdTTL: 3600, // 1 hora em segundos
  checkperiod: 7200, // Verifica a cada 2 horas
  useClones: false // Melhor desempenho
});

// Chaves de cache
const CACHE_KEYS = {
  HORARIOS_BY_ESTACIONAMENTO: 'horarios:estacionamento:',
  HORARIO_BY_ID: 'horario:ID:'
};

/**
 * Obtém horários de um estacionamento do cache
 * @param {number} estacionamentoId - ID do estacionamento
 * @returns {Array|null} - Array de horários ou null se não estiver em cache
 */
function getHorariosByEstacionamento(estacionamentoId) {
  try {
    const key = `${CACHE_KEYS.HORARIOS_BY_ESTACIONAMENTO}${estacionamentoId}`;
    const horarios = cache.get(key);
    
    if (horarios) {
      logger.debug(`[CACHE] Horários do estacionamento ${estacionamentoId} recuperados do cache`);
      return horarios;
    }
    
    return null;
  } catch (error) {
    logger.error('Erro ao buscar horários no cache:', error);
    return null;
  }
}

/**
 * Armazena horários de um estacionamento no cache
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {Array} horarios - Array de horários
 * @param {number} [ttl] - Tempo de vida em segundos (opcional)
 */
function setHorariosByEstacionamento(estacionamentoId, horarios, ttl) {
  try {
    const key = `${CACHE_KEYS.HORARIOS_BY_ESTACIONAMENTO}${estacionamentoId}`;
    const success = ttl 
      ? cache.set(key, horarios, ttl)
      : cache.set(key, horarios);
    
    if (success) {
      logger.debug(`[CACHE] Horários do estacionamento ${estacionamentoId} armazenados no cache`);
    } else {
      logger.warn(`[CACHE] Falha ao armazenar horários do estacionamento ${estacionamentoId} no cache`);
    }
  } catch (error) {
    logger.error('Erro ao armazenar horários no cache:', error);
  }
}

/**
 * Invalida o cache de horários de um estacionamento
 * @param {number} estacionamentoId - ID do estacionamento
 */
function invalidateHorariosByEstacionamento(estacionamentoId) {
  try {
    const key = `${CACHE_KEYS.HORARIOS_BY_ESTACIONAMENTO}${estacionamentoId}`;
    const count = cache.del(key);
    
    if (count > 0) {
      logger.debug(`[CACHE] Cache de horários do estacionamento ${estacionamentoId} invalidado`);
    }
    
    return count > 0;
  } catch (error) {
    logger.error('Erro ao invalidar cache de horários:', error);
    return false;
  }
}

/**
 * Limpa todo o cache de horários
 */
function clearAllHorariosCache() {
  try {
    const keys = cache.keys();
    const horarioKeys = keys.filter(key => 
      key.startsWith(CACHE_KEYS.HORARIOS_BY_ESTACIONAMENTO) || 
      key.startsWith(CACHE_KEYS.HORARIO_BY_ID)
    );
    
    if (horarioKeys.length > 0) {
      const count = cache.del(horarioKeys);
      logger.debug(`[CACHE] ${count} itens de cache de horários removidos`);
      return count;
    }
    
    return 0;
  } catch (error) {
    logger.error('Erro ao limpar cache de horários:', error);
    return 0;
  }
}

module.exports = {
  getHorariosByEstacionamento,
  setHorariosByEstacionamento,
  invalidateHorariosByEstacionamento,
  clearAllHorariosCache
};
