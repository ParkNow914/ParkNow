// utils/dateUtils.js
// Utilitário para manipulação de datas e fusos horários

const moment = require('moment-timezone');
const config = require('../config');

/**
 * Converte um timestamp para o fuso horário local configurado
 * @param {Date|string|number} date - Data a ser convertida
 * @returns {Date} Data convertida para o fuso horário local
 */
const toLocalTime = (date) => {
    if (!date) return new Date();
    
    // Converter para objeto moment
    const utcMoment = moment.utc(date);
    
    // Converter para o fuso horário local configurado
    return moment.tz(utcMoment, config.timezone.default).toDate();
};

/**
 * Converte um timestamp local para UTC
 * @param {Date|string|number} date - Data local a ser convertida
 * @returns {Date} Data convertida para UTC
 */
const toUTC = (date) => {
    if (!date) return new Date();
    
    // Converter para objeto moment no fuso horário local
    const localMoment = moment.tz(date, config.timezone.default);
    
    // Converter para UTC
    return localMoment.utc().toDate();
};

/**
 * Obtém o timestamp atual em UTC
 * @returns {Date} Data atual em UTC
 */
const nowUTC = () => {
    return moment.utc().toDate();
};

/**
 * Obtém o timestamp atual no fuso horário local configurado
 * @returns {Date} Data atual no fuso horário local
 */
const nowLocal = () => {
    return moment.tz(config.timezone.default).toDate();
};

/**
 * Formata uma data para o formato aceito pelo PostgreSQL
 * @param {Date|string|number} date - Data a ser formatada
 * @returns {string} Data formatada para PostgreSQL
 */
const formatForPostgres = (date) => {
    if (!date) date = new Date();
    return moment(date).toISOString();
};

/**
 * Formata uma data para ISO String com o 'Z' no final (para API)
 * @param {Date|string|number} date - Data a ser formatada
 * @returns {string} Data formatada para API
 */
const formatForAPI = (date) => {
    if (!date) date = new Date();
    return moment.utc(date).toISOString();
};

/**
 * Corrige um timestamp que pode estar no fuso horário incorreto
 * @param {Date|string|number} date - Data a ser corrigida
 * @param {number} offsetHours - Diferença em horas a ser aplicada (se necessário)
 * @returns {Date} Data corrigida
 */
const fixTimezoneOffset = (date, offsetHours = config.timezone.offsetHours) => {
    if (!date) return new Date();
    
    const dateMoment = moment(date);
    
    // Verificar se a data está no futuro (possível problema de fuso horário)
    if (dateMoment.isAfter(moment())) {
        // Verificar se a diferença é próxima de 3 horas (problema comum no Brasil)
        const diffHours = dateMoment.diff(moment(), 'hours');
        
        if (Math.abs(diffHours - Math.abs(offsetHours)) < 1) {
            // Aplicar correção de fuso horário
            return dateMoment.add(offsetHours, 'hours').toDate();
        }
    }
    
    return dateMoment.toDate();
};

/**
 * Calcula a diferença em segundos entre duas datas
 * @param {Date|string|number} startDate - Data de início
 * @param {Date|string|number} endDate - Data de fim (padrão: agora)
 * @returns {number} Diferença em segundos (sempre positiva ou zero)
 */
const diffInSeconds = (startDate, endDate = new Date()) => {
    if (!startDate) return 0;
    
    const start = moment(startDate);
    const end = moment(endDate);
    
    const seconds = end.diff(start, 'seconds');
    
    // Garantir que o resultado seja sempre positivo ou zero
    return Math.max(0, seconds);
};

/**
 * Formata segundos para formato HH:MM:SS
 * @param {number} seconds - Segundos a serem formatados
 * @returns {string} Tempo formatado
 */
const formatSecondsToTime = (seconds) => {
    if (!seconds || seconds < 0) seconds = 0;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

module.exports = {
    toLocalTime,
    toUTC,
    nowUTC,
    nowLocal,
    formatForPostgres,
    formatForAPI,
    fixTimezoneOffset,
    diffInSeconds,
    formatSecondsToTime
};
