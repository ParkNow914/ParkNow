// utils/redisClient.js
// Cliente Redis para blacklist de JWT e potencialmente caching.
// MODIFICADO: Funcionalidade completamente desabilitada conforme solicitado.

const config = require('../config');
const logger = require('./logger');

// const redis = require('redis'); // DESABILITADO

let redisClient = null;
const redisEnabled = false; // <-- FORÇADO PARA FALSE
const redisReady = false;   // <-- FORÇADO PARA FALSE

// Código de conexão comentado/removido
/*
if (config.redis?.host && config.redis?.port) {
    // ... lógica de conexão Redis ...
} else {
    logger.warn('[Redis] Configuração Redis não encontrada. Funcionalidades Redis desabilitadas.');
}
*/
logger.warn('[Redis] Funcionalidade Redis (incluindo blacklist JWT) está DESABILITADA nesta configuração.');

// Inicializa cliente Redis (DESABILITADO)
const initRedisClient = () => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
    return null;
};

// Verifica se o cliente Redis está conectado (DESABILITADO)
const isRedisConnected = () => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
    return false;
};

// Adiciona token à blacklist (DESABILITADO)
const blacklistToken = async (token, expiresIn) => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
    return false;
};

// Verifica se token está na blacklist (DESABILITADO)
const isTokenBlacklisted = async (token) => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
    return false;
};

// Fecha conexão Redis (DESABILITADO)
const closeRedisConnection = () => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
};

// Verifica se Redis está ativo (sempre false agora)
const isRedisAvailable = () => false;

module.exports = {
    initRedisClient,
    isRedisConnected,
    blacklistToken,
    isTokenBlacklisted,
    closeRedisConnection,
    isRedisAvailable
};