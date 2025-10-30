const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Cache para armazenar os dados de localização por IP (1 hora de duração)
const locationCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

class TimeService {
    constructor() {
        this.timeApi = 'http://worldtimeapi.org/api/ip';
        this.ipApi = 'http://ip-api.com/json/';
    }

    /**
     * Obtém o fuso horário com base no IP do cliente
     * @param {string} clientIp - Endereço IP do cliente
     * @returns {Promise<{timezone: string, currentTime: string}>}
     */
    async getClientTimezone(clientIp) {
        try {
            // Verifica se já temos os dados em cache
            const cachedData = locationCache.get(clientIp);
            if (cachedData) {
                return cachedData;
            }

            // Se não estiver em cache, busca a localização pelo IP
            const response = await axios.get(`${this.ipApi}${clientIp}?fields=status,message,timezone,offset`);
            
            if (response.data.status === 'success') {
                const timezone = response.data.timezone || 'America/Sao_Paulo';
                const offset = response.data.offset || -180; // Default para -03:00
                
                // Busca o horário atual para o timezone
                const timeResponse = await axios.get(`${this.timeApi}/${timezone}`);
                
                const result = {
                    timezone,
                    currentTime: timeResponse.data.datetime,
                    offset: offset / 3600 // Converte segundos para horas
                };
                
                // Armazena no cache
                locationCache.set(clientIp, result);
                return result;
            }
            
            // Se falhar, retorna o padrão
            return {
                timezone: 'America/Sao_Paulo',
                currentTime: new Date().toISOString(),
                offset: -3
            };
            
        } catch (error) {
            logger.error('Erro ao obter timezone por IP:', error);
            return {
                timezone: 'America/Sao_Paulo',
                currentTime: new Date().toISOString(),
                offset: -3
            };
        }
    }

    /**
     * Obtém a data/hora atual no timezone especificado
     * @param {string} timezone - Timezone (ex: America/Sao_Paulo)
     * @returns {Promise<{currentTime: string, timezone: string}>}
     */
    async getCurrentTime(timezone = 'America/Sao_Paulo') {
        try {
            const response = await axios.get(`${this.timeApi}/${timezone}`);
            return {
                currentTime: response.data.datetime,
                timezone: response.data.timezone || timezone
            };
        } catch (error) {
            logger.error('Erro ao obter horário atual:', error);
            return {
                currentTime: new Date().toISOString(),
                timezone: 'America/Sao_Paulo'
            };
        }
    }
}

// Exporta uma instância única (singleton)
module.exports = new TimeService();
