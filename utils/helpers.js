// utils/helpers.js
// Funções utilitárias gerais para a aplicação.

const logger = require('./logger'); // Para logar erros de formatação

/**
 * Formata uma duração de tempo dada em milissegundos para o formato HH:MM:SS.
 * @param {number|null|undefined} ms - A duração em milissegundos.
 * @returns {string} "HH:MM:SS" ou "00:00:00".
 */
const formatarTempo = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) { // Checa null, undefined, NaN, < 0
        return "00:00:00";
    }
    const totalSegundos = Math.floor(ms / 1000);
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
};

/**
 * Formata um número para moeda Brasileira (Real - BRL).
 * @param {number|string|null|undefined} value - O valor numérico.
 * @returns {string} Valor formatado como "R$ XX,XX" ou "R$ 0,00".
 */
const formatarMoeda = (value) => {
    const number = parseFloat(value); // Tenta converter string
    if (value == null || isNaN(number)) { // Checa null, undefined, NaN
        return 'R$ 0,00';
    }
    try {
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch (error) {
        logger.error('Erro ao formatar moeda:', { value, error: error.message });
        return 'R$ ?'; // Retorna algo indicando erro
    }
};

/**
 * Formata um objeto Date ou string ISO para data e hora local (pt-BR).
 * @param {Date|string|null|undefined} dateInput - A data/hora.
 * @returns {string} Data/hora formatada (DD/MM/AAAA, HH:MM) ou string vazia.
 */
const formatarDataHora = (dateInput) => {
    if (!dateInput) return ''; // Retorna vazio se entrada for null/undefined/vazia
    try {
        const date = new Date(dateInput);
        // Verifica se a data resultante é válida
        if (isNaN(date.getTime())) {
             logger.warn(`[Helper] Tentativa de formatar data inválida: ${dateInput}`);
             return '';
        }
        return date.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            // timeZone: 'America/Sao_Paulo' // Opcional: Forçar timezone se necessário
        });
    } catch (error) {
         logger.error('Erro ao formatar data/hora:', { input: dateInput, error: error.message });
        return '';
    }
};

/**
 * Remove acentos e caracteres especiais de uma string (útil para buscas).
 * @param {string} str - String de entrada.
 * @returns {string} String normalizada.
 */
const normalizeString = (str = '') => {
    if (!str) return '';
    return str
        .normalize('NFD') // Separa acentos dos caracteres base
        .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
        .toLowerCase(); // Converte para minúsculas
};


// Exporta as funções
module.exports = {
    formatarTempo,
    formatarMoeda,
    formatarDataHora,
    normalizeString // Exporta nova função
};