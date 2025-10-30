// models/usuarioModel.js
// Funções para interagir com a tabela 'usuarios'.

const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Busca um usuário pelo ID
 * @param {number} userId - ID do usuário
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<object|undefined>} Dados do usuário ou undefined se não encontrado
 */
async function findUserById(userId, connection = pool) {
    try {
        const query = `
            SELECT id, nome, email, cpf, telefone, data_cadastro, ativo, tipo_usuario
            FROM usuarios
            WHERE id = $1
        `;
        
        const result = await connection.query(query, [userId]);
        return result.rows[0];
    } catch (error) {
        logger.error(`Erro ao buscar usuário por ID ${userId}:`, error);
        throw error;
    }
}

/**
 * Busca um usuário pelo email
 * @param {string} email - Email do usuário
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<object|undefined>} Dados do usuário ou undefined se não encontrado
 */
async function findUserByEmail(email, connection = pool) {
    try {
        const query = `
            SELECT id, nome, email, cpf, telefone, data_cadastro, ativo, tipo_usuario
            FROM usuarios
            WHERE email = $1
        `;
        
        const result = await connection.query(query, [email]);
        return result.rows[0];
    } catch (error) {
        logger.error(`Erro ao buscar usuário por email ${email}:`, error);
        throw error;
    }
}

/**
 * Atualiza os dados do usuário
 * @param {number} userId - ID do usuário
 * @param {object} userData - Dados para atualização
 * @param {string} [userData.nome] - Nome do usuário
 * @param {string} [userData.telefone] - Telefone do usuário
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<boolean>} True se a atualização foi bem-sucedida
 */
async function updateUser(userId, userData, connection = pool) {
    try {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        // Construir a query dinamicamente com base nos campos fornecidos
        for (const [key, value] of Object.entries(userData)) {
            if (value !== undefined) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (fields.length === 0) {
            throw new Error('Nenhum campo válido para atualização fornecido');
        }

        // Adiciona o ID como último parâmetro
        values.push(userId);
        const query = `
            UPDATE usuarios
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id
        `;

        const result = await connection.query(query, values);
        return result.rowCount > 0;
    } catch (error) {
        logger.error(`Erro ao atualizar usuário ${userId}:`, error);
        throw error;
    }
}

/**
 * Busca o veículo padrão de um usuário
 * @param {number} userId - ID do usuário
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<object|undefined>} Dados do veículo ou undefined se não encontrado
 */
async function findDefaultVehicleByUserId(userId, connection = pool) {
    try {
        const query = `
            SELECT id, tipo_veiculo, placa_veiculo
            FROM veiculos
            WHERE usuario_id = $1 AND padrao = TRUE
            LIMIT 1
        `;
        
        const result = await connection.query(query, [userId]);
        return result.rows[0];
    } catch (error) {
        logger.error(`Erro ao buscar veículo padrão do usuário ${userId}:`, error);
        throw error;
    }
}

module.exports = {
    findUserById,
    findUserByEmail,
    updateUser,
    findDefaultVehicleByUserId
};
