// models/userModel.js
// Contém as funções para interagir com a tabela 'usuarios' no banco de dados.

const { pool } = require('../utils/dbUtils'); // Importa a pool de conexões
const logger = require('../utils/logger'); // Importa o logger
const bcrypt = require('bcrypt'); // Para comparar hash do refresh token

/** Busca usuário por email (ativo ou não, para verificar existência/reset) */
const findUserByEmailInternal = async (email) => {
    const sql = 'SELECT * FROM usuarios WHERE email = $1 LIMIT 1';
    try { 
        const { rows } = await pool.query(sql, [email]); 
        return rows[0]; 
    } catch (error) { 
        logger.error(`Erro em findUserByEmailInternal(${email}):`, error); 
        throw error; 
    }
};

/** Busca usuário ativo por email (para login) */
const findUserByEmail = async (email) => {
    const sql = 'SELECT * FROM usuarios WHERE email = $1 AND status = \'ativo\' LIMIT 1';
    try { 
        const { rows } = await pool.query(sql, [email]); 
        return rows[0]; 
    } catch (error) { 
        logger.error(`Erro em findUserByEmail(${email}, ativo):`, error); 
        throw error; 
    }
};

/** Busca usuário por ID (sem senha/tokens) */
const findUserById = async (id) => {
    const sql = 'SELECT id, nome, email, telefone, tipo_veiculo, placa_veiculo, cpf, data_cadastro, status, foto_perfil FROM usuarios WHERE id = $1 LIMIT 1';
    try { 
        const { rows } = await pool.query(sql, [id]); 
        return rows[0]; 
    } catch (error) { 
        logger.error(`Erro em findUserById (ID: ${id}):`, error); 
        throw error; 
    }
};

/** Cria novo usuário */
const createUser = async (userData) => {
    const { nome, email, senhaHash, telefone, tipo_veiculo, placa_veiculo, cpf } = userData;
    
    // Iniciar transação para garantir consistência
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Inserir usuário
        const sqlUser = `
            INSERT INTO usuarios (nome, email, senha, telefone, tipo_veiculo, placa_veiculo, cpf, status, data_cadastro)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'ativo', NOW())
            RETURNING id, nome, email, telefone, tipo_veiculo, placa_veiculo, cpf, data_cadastro, status
        `;
        const { rows } = await client.query(sqlUser, [
            nome, 
            email, 
            senhaHash, 
            telefone, 
            tipo_veiculo, 
            placa_veiculo ? placa_veiculo.toUpperCase() : null, 
            cpf || null
        ]);
        
        const user = rows[0];
        logger.info(`Usuário criado ID: ${user.id}`);
        
        // Se forneceu placa e tipo de veículo, criar registro na tabela veiculos
        if (placa_veiculo && tipo_veiculo) {
            const sqlVeiculo = `
                INSERT INTO veiculos (usuario_id, tipo_veiculo, placa_veiculo, padrao)
                VALUES ($1, $2, $3, true)
                ON CONFLICT (usuario_id, placa_veiculo) DO NOTHING
            `;
            await client.query(sqlVeiculo, [
                user.id,
                tipo_veiculo,
                placa_veiculo.toUpperCase()
            ]);
            logger.info(`Veículo cadastrado para usuário ID: ${user.id}, Placa: ${placa_veiculo.toUpperCase()}`);
        }
        
        await client.query('COMMIT');
        return user;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao criar usuário:', { email, error });
        throw error;
    } finally {
        client.release();
    }
};

/** Atualiza dados do usuário (exceto senha/status) */
const updateUser = async (id, userData) => {
    try {
        // Garantir que userData não seja null ou undefined
        if (!userData) {
            logger.error(`Erro em updateUser (ID: ${id}): userData não fornecido`);
            throw new Error('Dados de atualização não fornecidos');
        }
        
        // Construir dinamicamente a consulta SQL com base nos campos fornecidos
        const fields = [];
        const values = [];
        let paramCount = 1;
        
        // Verificar e adicionar cada campo se estiver presente
        if ('nome' in userData && userData.nome !== undefined) {
            fields.push(`nome = $${paramCount++}`);
            values.push(userData.nome);
        }
        
        if ('email' in userData && userData.email !== undefined) {
            fields.push(`email = $${paramCount++}`);
            values.push(userData.email);
        }
        
        if ('telefone' in userData && userData.telefone !== undefined) {
            fields.push(`telefone = $${paramCount++}`);
            values.push(userData.telefone);
        }
        
        if ('tipo_veiculo' in userData && userData.tipo_veiculo !== undefined) {
            fields.push(`tipo_veiculo = $${paramCount++}`);
            values.push(userData.tipo_veiculo);
        }
        
        if ('placa_veiculo' in userData && userData.placa_veiculo !== undefined) {
            fields.push(`placa_veiculo = $${paramCount++}`);
            values.push(userData.placa_veiculo ? userData.placa_veiculo.toUpperCase() : null);
        }
        
        if ('cpf' in userData && userData.cpf !== undefined) {
            fields.push(`cpf = $${paramCount++}`);
            values.push(userData.cpf || null);
        }
        
        if ('foto_perfil' in userData && userData.foto_perfil !== undefined) {
            fields.push(`foto_perfil = $${paramCount++}`);
            values.push(userData.foto_perfil);
        }
        
        // Se não houver campos para atualizar, retornar false
        if (fields.length === 0) {
            logger.warn(`Atualização de usuário ID ${id} sem campos válidos`);
            return false;
        }
        
        // Adicionar o ID no final dos valores para a cláusula WHERE
        values.push(id);
        
        // Construir a consulta SQL com parâmetros posicionais do PostgreSQL
        const sql = `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${paramCount}`;
        
        // Executar a consulta
        const { rowCount } = await pool.query(sql, values);
        
        // Verificar se alguma linha foi afetada
        if (rowCount === 0) {
            logger.warn(`Nenhum usuário encontrado com ID: ${id}`);
            return false;
        }
        
        logger.info(`Usuário ID ${id} atualizado com sucesso`);
        return true;
        
    } catch (error) {
        // Verificar se é um erro de chave duplicada (email ou CPF)
        if (error.code === '23505') { // Código de erro de violação de restrição única no PostgreSQL
            if (error.constraint && error.constraint.includes('email')) {
                throw new Error('Este e-mail já está em uso por outro usuário.');
            } else if (error.constraint && error.constraint.includes('cpf')) {
                throw new Error('Este CPF já está cadastrado.');
            }
        }
        
        logger.error(`Erro ao atualizar usuário ID ${id}:`, error);
        throw error;
    }
};

/** Salva token reset senha */
const savePasswordResetToken = async (userId, hashedToken, expiresAt) => {
    const sql = 'UPDATE usuarios SET reset_token = $1, reset_token_expira = $2 WHERE id = $3';
    try { 
        await pool.query(sql, [hashedToken, expiresAt, userId]); 
    } catch (error) { 
        logger.error('Erro ao salvar token de reset:', error); 
        throw error; 
    }
};

/** Busca user por token reset válido */
const findUserByValidResetToken = async (hashedToken) => {
    const sql = 'SELECT * FROM usuarios WHERE reset_token = $1 AND reset_token_expira > NOW()';
    try { 
        const { rows } = await pool.query(sql, [hashedToken]); 
        return rows[0]; 
    } catch (error) { 
        logger.error('Erro ao buscar usuário por token de reset:', error); 
        throw error; 
    }
};

/** Atualiza senha e limpa tokens */
const updateUserPassword = async (userId, newPasswordHash) => {
    const sql = 'UPDATE usuarios SET senha = $1, reset_token = NULL, reset_token_expira = NULL WHERE id = $2';
    try {
        await pool.query(sql, [newPasswordHash, userId]);
    } catch (error) {
        logger.error('Erro ao atualizar senha:', error);
        throw error;
    }
};

/** Salva token de verificação de email (hash) com expiração */
const saveEmailVerificationToken = async (userId, hashedToken, expiresAt) => {
    const sql = 'UPDATE usuarios SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3';
    try {
        await pool.query(sql, [hashedToken, expiresAt, userId]);
    } catch (error) {
        logger.error('Erro ao salvar token de verificação de email:', error);
        throw error;
    }
};

/** Busca usuário por token de verificação de email válido (não expirado) */
const findUserByEmailVerificationToken = async (hashedToken) => {
    const sql = 'SELECT * FROM usuarios WHERE email_verification_token = $1 AND email_verification_expires > NOW()';
    try {
        const { rows } = await pool.query(sql, [hashedToken]);
        return rows[0];
    } catch (error) {
        logger.error('Erro ao buscar usuário por token de verificação de email:', error);
        throw error;
    }
};

/** Marca email como verificado e limpa o token */
const markEmailVerified = async (userId) => {
    const sql = `UPDATE usuarios
                 SET email_verified_at = NOW(),
                     email_verification_token = NULL,
                     email_verification_expires = NULL
                 WHERE id = $1
                 RETURNING id`;
    try {
        const { rowCount } = await pool.query(sql, [userId]);
        return rowCount > 0;
    } catch (error) {
        logger.error('Erro ao marcar email como verificado:', error);
        throw error;
    }
};

/** 
 * Busca usuários que já estacionaram ou fizeram reservas em um estacionamento específico
 * @param {number} estacionamentoId - ID do estacionamento para filtrar usuários
 * @returns {Promise<Array>} Lista de usuários que interagiram com o estacionamento
 */
const findUsersByEstacionamento = async (estacionamentoId) => {
    const sql = `
        SELECT DISTINCT u.id, u.nome, u.email, u.telefone, u.tipo_veiculo, 
               u.placa_veiculo, u.cpf, u.data_cadastro, u.status
        FROM usuarios u
        LEFT JOIN reservas r ON u.id = r.usuario_id
        LEFT JOIN logs_veiculos lv ON u.id = lv.usuario_id
        WHERE (r.estacionamento_id = $1 OR lv.estacionamento_id = $1)
        ORDER BY u.nome ASC
    `;
    
    try { 
        const { rows } = await pool.query(sql, [estacionamentoId]);
        return rows; 
    } catch (error) { 
        logger.error('Erro ao buscar usuários do estacionamento:', error);
        throw error; 
    }
};

/** 
 * Busca todos usuários para admin
 * @deprecated Use findUsersByEstacionamento para filtrar por estacionamento
 */
const findAllUsersAdmin = async (estacionamentoId) => {
    // Se um estacionamentoId for fornecido, filtra os usuários
    if (estacionamentoId) {
        return findUsersByEstacionamento(estacionamentoId);
    }
    
    // Comportamento antigo (para compatibilidade)
    const sql = 'SELECT id, nome, email, telefone, tipo_veiculo, placa_veiculo, cpf, data_cadastro, status FROM usuarios';
    try { 
        const { rows } = await pool.query(sql); 
        return rows; 
    } catch (error) { 
        logger.error('Erro ao buscar todos os usuários:', error); 
        throw error; 
    }
};

/** Define status do usuário (admin) */
const setUserStatusAdmin = async (userId, status) => {
    if (status !== 'ativo' && status !== 'inativo') throw new Error("Status inválido.");
    const sql = 'UPDATE usuarios SET status = $1 WHERE id = $2';
    try { 
        await pool.query(sql, [status, userId]); 
    } catch (error) { 
        logger.error(`Erro ao atualizar status do usuário ${userId}:`, error); 
        throw error; 
    }
};

/** Salva hash refresh token */
const saveRefreshTokenHash = async (userId, refreshTokenHash) => {
    const sql = 'UPDATE usuarios SET refresh_token_hash = $1 WHERE id = $2';
    try { 
        await pool.query(sql, [refreshTokenHash, userId]); 
    } catch (error) { 
        logger.error('Erro ao salvar hash do refresh token:', error); 
        throw error; 
    }
};

/** Verifica hash refresh token */
const verifyRefreshTokenHash = async (userId, requestRefreshToken) => {
    const sql = 'SELECT refresh_token_hash FROM usuarios WHERE id = $1';
    try {
        const { rows } = await pool.query(sql, [userId]);
        if (!rows[0] || !rows[0].refresh_token_hash) return false;
        return await bcrypt.compare(requestRefreshToken, rows[0].refresh_token_hash);
    } catch (error) { 
        logger.error('Erro ao verificar refresh token:', error); 
        throw error; 
    }
};

/** Limpa hash refresh token */
const clearRefreshTokenHash = async (userId) => {
    logger.info(`Limpando hash RT U:${userId}`); return saveRefreshTokenHash(userId, null);
};

module.exports = { 
    findUserByEmailInternal, 
    findUserByEmail, 
    findUserById, 
    createUser, 
    updateUser, 
    savePasswordResetToken,
    findUserByValidResetToken,
    updateUserPassword,
    saveEmailVerificationToken,
    findUserByEmailVerificationToken,
    markEmailVerified,
    findAllUsersAdmin,
    setUserStatusAdmin, 
    saveRefreshTokenHash, 
    verifyRefreshTokenHash, 
    clearRefreshTokenHash
};