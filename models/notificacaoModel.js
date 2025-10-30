const db = require('../config/database');
const logger = require('../utils/logger');

class NotificacaoModel {
    /**
     * Cria uma nova notificação no banco de dados
     * @param {Object} notificacao - Dados da notificação
     * @param {Object} client - Cliente de banco de dados (opcional para transações)
     * @returns {Promise<Object>} - A notificação criada
     */
    static async criarNotificacao(notificacao, client = null) {
        const query = `
            INSERT INTO notificacoes (
                usuario_id, 
                tipo, 
                titulo, 
                mensagem, 
                lida, 
                dados_adicionais,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            RETURNING *
        `;
        
        const values = [
            notificacao.usuario_id,
            notificacao.tipo,
            notificacao.titulo,
            notificacao.mensagem,
            notificacao.lida || false,
            notificacao.dados_adicionais || {}
        ];
        
        try {
            const result = client 
                ? await client.query(query, values)
                : await db.query(query, values);
                
            return result.rows[0];
        } catch (error) {
            logger.error('Erro ao criar notificação:', {
                error: error.message,
                stack: error.stack,
                notificacao
            });
            throw error;
        }
    }

    /**
     * Busca notificações não lidas de um usuário
     * @param {number} usuarioId - ID do usuário
     * @param {Object} options - Opções de busca
     * @param {number} options.limit - Limite de resultados
     * @param {number} options.offset - Deslocamento para paginação
     * @returns {Promise<Array>} - Lista de notificações
     */
    static async buscarNotificacoesNaoLidas(usuarioId, { limit = 10, offset = 0 } = {}) {
        const query = `
            SELECT * FROM notificacoes
            WHERE usuario_id = $1 AND lida = false
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;
        
        const values = [usuarioId, limit, offset];
        
        try {
            const result = await db.query(query, values);
            return result.rows;
        } catch (error) {
            logger.error('Erro ao buscar notificações não lidas:', {
                error: error.message,
                stack: error.stack,
                usuarioId
            });
            throw error;
        }
    }

    /**
     * Marca uma notificação como lida
     * @param {number} notificacaoId - ID da notificação
     * @param {number} usuarioId - ID do usuário (para segurança)
     * @param {Object} client - Cliente de banco de dados (opcional para transações)
     * @returns {Promise<Object>} - A notificação atualizada
     */
    static async marcarComoLida(notificacaoId, usuarioId, client = null) {
        const query = `
            UPDATE notificacoes 
            SET lida = true, updated_at = NOW()
            WHERE id = $1 AND usuario_id = $2
            RETURNING *
        `;
        
        const values = [notificacaoId, usuarioId];
        
        try {
            const result = client 
                ? await client.query(query, values)
                : await db.query(query, values);
                
            if (result.rowCount === 0) {
                throw new Error('Notificação não encontrada ou não pertence ao usuário');
            }
            
            return result.rows[0];
        } catch (error) {
            logger.error('Erro ao marcar notificação como lida:', {
                error: error.message,
                stack: error.stack,
                notificacaoId,
                usuarioId
            });
            throw error;
        }
    }

    /**
     * Marca todas as notificações de um usuário como lidas
     * @param {number} usuarioId - ID do usuário
     * @param {Object} client - Cliente de banco de dados (opcional para transações)
     * @returns {Promise<Object>} - Resultado da operação
     */
    static async marcarTodasComoLidas(usuarioId, client = null) {
        const query = `
            UPDATE notificacoes 
            SET lida = true, updated_at = NOW()
            WHERE usuario_id = $1 AND lida = false
            RETURNING id
        `;
        
        const values = [usuarioId];
        
        try {
            const result = client 
                ? await client.query(query, values)
                : await db.query(query, values);
                
            return {
                success: true,
                atualizadas: result.rowCount
            };
        } catch (error) {
            logger.error('Erro ao marcar todas as notificações como lidas:', {
                error: error.message,
                stack: error.stack,
                usuarioId
            });
            throw error;
        }
    }

    /**
     * Busca notificações de um usuário com paginação
     * @param {number} usuarioId - ID do usuário
     * @param {Object} options - Opções de busca
     * @param {number} options.limit - Limite de resultados por página
     * @param {number} options.page - Número da página
     * @param {boolean} options.onlyUnread - Apenas não lidas
     * @returns {Promise<Object>} - Objeto com notificações e metadados de paginação
     */
    static async buscarNotificacoesPorUsuario(usuarioId, { limit = 10, page = 1, onlyUnread = false } = {}) {
        const offset = (page - 1) * limit;
        
        // Query base
        let whereClause = 'WHERE usuario_id = $1';
        const queryParams = [usuarioId];
        
        if (onlyUnread) {
            whereClause += ' AND lida = false';
        }
        
        // Query para contar o total
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM notificacoes 
            ${whereClause}
        `;
        
        // Query para buscar os dados
        const dataQuery = `
            SELECT * 
            FROM notificacoes
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;
        
        try {
            // Executa as queries em paralelo
            const [countResult, dataResult] = await Promise.all([
                db.query(countQuery, queryParams),
                db.query(dataQuery, [...queryParams, limit, offset])
            ]);
            
            const total = parseInt(countResult.rows[0].total, 10);
            const totalPages = Math.ceil(total / limit);
            
            return {
                data: dataResult.rows,
                pagination: {
                    total,
                    totalPages,
                    currentPage: page,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            };
        } catch (error) {
            logger.error('Erro ao buscar notificações por usuário:', {
                error: error.message,
                stack: error.stack,
                usuarioId,
                options: { limit, page, onlyUnread }
            });
            throw error;
        }
    }
}

module.exports = NotificacaoModel;
