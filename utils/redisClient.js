// utils/redisClient.js
// Cliente Redis para blacklist de JWT e potencialmente caching.
// MODIFICADO: Funcionalidade completamente desabilitada conforme solicitado.

const _config = require('../config');
const logger = require('./logger');

// const redis = require('redis'); // DESABILITADO

let _redisClient = null;
const _redisEnabled = false; // <-- FORÇADO PARA FALSE
const _redisReady = false;   // <-- FORÇADO PARA FALSE

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
const blacklistToken = async (_token, _expiresIn) => {
    logger.warn('[Redis] Funcionalidade Redis desabilitada.');
    return false;
};

// Verifica se token está na blacklist (DESABILITADO)
const isTokenBlacklisted = async (_token) => {
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