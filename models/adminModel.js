// models/adminModel.js
// Contém as funões para interagir com a tabela 'admins' no banco de dados.

const { pool } = require('../utils/dbUtils'); // Importa a pool de conexões
const logger = require('../utils/logger'); // Importa o logger
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const BCRYPT_SALT_ROUNDS = 12; // Número de rodadas para o salt do bcrypt

// Função para gerar hash de senha usando bcrypt
const hashPassword = async (password) => {
    if (!password || typeof password !== 'string') {
        throw new Error("Senha inválida fornecida para hashing.");
    }
    try {
        const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        logger.debug('[Auth] Hash bcrypt gerado com sucesso.');
        return hash;
    } catch (err) {
        logger.error("[Auth] Erro ao gerar hash bcrypt:", err);
        throw new Error("Erro interno ao processar a senha.");
    }
};

/**
 * Busca um administrador ativo pelo seu endereço de email.
 * Retorna o objeto completo do administrador, incluindo o hash da senha e do refresh token.
 * @param {string} email - O email do administrador a ser buscado.
 * @returns {Promise<object|undefined>} O objeto do administrador ou undefined se não encontrado/inativo.
 */
const findAdminByEmail = async (email) => {
    const sql = 'SELECT * FROM admins WHERE email = $1 AND status = $2 LIMIT 1'; 
    try {
        const result = await pool.query(sql, [email, 'ativo']);
        if (result.rows[0]) {
            // Log the hash type for debugging
            const hash = result.rows[0].senha || '';
            const hashType = hash.startsWith('$2') ? 'bcrypt' : 
                             hash.startsWith('$argon2') ? 'argon2' : 'unknown';
            logger.debug(`[Auth] Found admin with hash type: ${hashType}`);
        }
        return result.rows[0];
    } catch (error) {
        logger.error('Erro em findAdminByEmail:', { email, error: error.message });
        throw error; 
    }
};

/**
 * Busca um administrador pelo seu ID.
 * Retorna dados públicos do administrador (sem senhas/tokens).
 * @param {number} id - O ID do administrador a ser buscado.
 * @returns {Promise<object|undefined>} O objeto do administrador ou undefined se não encontrado.
 */
const findAdminById = async (id) => {
    const sql = 'SELECT id, nome, email, data_cadastro, status FROM admins WHERE id = $1 LIMIT 1';
    try {
        const result = await pool.query(sql, [id]);
        return result.rows[0];
    } catch (error) {
        logger.error(`Erro em findAdminById (ID: ${id}):`, { error: error.message });
        throw error;
    }
};

/**
 * Cria um novo administrador no banco de dados.
 * @param {object} adminData - Objeto contendo os dados do administrador.
 * @param {string} adminData.nome
 * @param {string} adminData.email
 * @param {string} adminData.senhaHash - Hash Argon2 da senha.
 * @returns {Promise<number>} O ID do administrador recém-criado.
 */
const createAdmin = async (adminData) => {
    const { nome, email, senhaHash, telefone, cnpj } = adminData;
    
    // Verifica se a senha foi fornecida
    if (!senhaHash) {
        throw new Error('Senha hash não fornecida para criar admin');
    }
    
    // Insere com status 'ativo', telefone e CNPJ
    const sql = `
        INSERT INTO admins (nome, email, senha, telefone, cnpj, status, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, 'ativo', NOW(), NOW()) 
        RETURNING id
    `;
    try {
        const result = await pool.query(sql, [nome, email, senhaHash, telefone || null, cnpj || null]);
        logger.info(`[Auth] Admin criado com ID: ${result.rows[0].id}, Telefone: ${telefone}, CNPJ: ${cnpj}`);
        return result.rows[0].id;
    } catch (error) {
        logger.error('[Auth] Erro em createAdmin:', { email, error: error.message, code: error.code });
        throw error; // Deixa o controller tratar erro de duplicação
    }
};

/**
 * Salva um token de reset de senha e sua data de expiração para um admin.
 * @param {number} adminId
 * @param {string} hashedToken - Hash SHA-256 do token de reset.
 * @param {Date} expiresAt - Data/hora de expiração.
 * @returns {Promise<boolean>} true se sucesso.
 */
const saveAdminPasswordResetToken = async (adminId, hashedToken, expiresAt) => {
    const sql = 'UPDATE admins SET reset_token = $1, reset_token_expires = $2 WHERE id = $3';
    try {
        const result = await pool.query(sql, [hashedToken, expiresAt, adminId]);
        return result.rowCount > 0;
    } catch (error) {
        logger.error(`Erro em saveAdminPasswordResetToken (AdminID: ${adminId}):`, { error: error.message });
        throw error;
    }
};

/**
 * Busca admin por token de reset válido (hash SHA-256) e não expirado.
 * @param {string} hashedToken
 * @returns {Promise<object|undefined>} Admin (sem senha/tokens) ou undefined.
 */
const findAdminByValidResetToken = async (hashedToken) => {
    const sql = `SELECT id, nome, email, status FROM admins WHERE reset_token = $1 AND reset_token_expires > NOW() LIMIT 1`;
    try {
        const result = await pool.query(sql, [hashedToken]);
        return result.rows[0];
    } catch (error) {
        logger.error('Erro em findAdminByValidResetToken:', { error: error.message });
        throw error;
    }
};

/**
 * Atualiza senha do admin e limpa tokens de reset e refresh.
 * @param {number} adminId
 * @param {string} newPassword - Nova senha em texto plano.
 * @returns {Promise<boolean>} true se sucesso.
 */
const updateAdminPassword = async (adminId, newPassword) => {
    try {
        // Gera o hash da nova senha usando bcrypt
        const newPasswordHash = await hashPassword(newPassword);
        
        const sql = `UPDATE admins SET senha = $1, reset_token = NULL, reset_token_expires = NULL, refresh_token_hash = NULL WHERE id = $2`;
        const result = await pool.query(sql, [newPasswordHash, adminId]);
        
        if (result.rowCount === 0) {
            logger.warn(`[Auth] Tentativa de atualizar senha de admin não encontrado: ${adminId}`);
            return false;
        }
        
        logger.info(`[Auth] Senha do admin ${adminId} atualizada com sucesso.`);
        return true;
    } catch (error) {
        logger.error(`[Auth] Erro em updateAdminPassword (AdminID: ${adminId}):`, { error: error.message });
        throw error;
    }
};

/**
 * Salva o hash (bcrypt) de um refresh token para um admin.
 * @param {number} adminId
 * @param {string|null} refreshTokenHash - Hash bcrypt ou NULL para limpar.
 * @returns {Promise<boolean>}
 */
const saveAdminRefreshTokenHash = async (adminId, refreshTokenHash) => {
    const sql = 'UPDATE admins SET refresh_token_hash = $1 WHERE id = $2';
    try {
        const result = await pool.query(sql, [refreshTokenHash, adminId]);
        if (refreshTokenHash) logger.debug(`Hash RT salvo para Admin ID: ${adminId}`);
        return result.rowCount > 0;
    } catch (error) {
        logger.error(`Erro saveAdminRefreshTokenHash (AdminID: ${adminId}):`, { error: error.message });
        throw error;
    }
};

/**
 * Verifica se um refresh token (texto plano) corresponde ao hash (bcrypt) salvo para um admin.
 * @param {number} adminId
 * @param {string} requestRefreshToken - O token recebido do cliente.
 * @returns {Promise<boolean>} true se corresponder, false caso contrário ou erro.
 */
const verifyAdminRefreshTokenHash = async (adminId, requestRefreshToken) => {
    if (!adminId || !requestRefreshToken) {
        logger.warn('[Auth] verifyAdminRefreshTokenHash chamado sem adminId ou token');
        return false;
    }

    const sql = 'SELECT refresh_token_hash FROM admins WHERE id = $1 LIMIT 1';
    try {
        const result = await pool.query(sql, [adminId]);
        const admin = result.rows[0];
        
        if (!admin || !admin.refresh_token_hash) {
            logger.warn(`[Auth] Nenhum refresh token encontrado para admin ID: ${adminId}`);
            return false;
        }

        // Usa bcrypt.compare para verificar o token
        const isMatch = await bcrypt.compare(requestRefreshToken, admin.refresh_token_hash);
        if (!isMatch) {
            logger.warn(`[Auth] Refresh token não corresponde para admin ID: ${adminId}`);
        } else {
            logger.debug(`[Auth] Refresh token válido para admin ID: ${adminId}`);
        }
        return isMatch;
    } catch (error) {
        logger.error('[Auth] Erro em verifyAdminRefreshTokenHash:', { adminId, error: error.message });
        return false; // Em caso de erro, não permite acesso
    }
};

/** Limpa hash do refresh token do admin (invalida sessão persistente) */
const clearAdminRefreshTokenHash = async (adminId) => {
    logger.info(`Limpando hash refresh token para Admin ID: ${adminId}`);
    // Chama a função de salvar com NULL
    return saveAdminRefreshTokenHash(adminId, null);
};

module.exports = {
    findAdminByEmail, findAdminById, createAdmin,
    saveAdminPasswordResetToken, findAdminByValidResetToken, updateAdminPassword,
    saveAdminRefreshTokenHash, verifyAdminRefreshTokenHash, clearAdminRefreshTokenHash
};