const NotificacaoModel = require('../models/notificacaoModel');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

class NotificacaoService {
    /**
     * Cria uma nova notificação
     * @param {Object} dadosNotificacao - Dados da notificação
     * @param {number} dadosNotificacao.usuario_id - ID do usuário destinatário
     * @param {string} dadosNotificacao.tipo - Tipo da notificação (ex: 'pix_copiado', 'pagamento_confirmado')
     * @param {string} dadosNotificacao.titulo - Título da notificação
     * @param {string} dadosNotificacao.mensagem - Mensagem da notificação
     * @param {boolean} [dadosNotificacao.lida=false] - Se a notificação está lida
     * @param {Object} [dadosNotificacao.dados_adicionais={}] - Dados adicionais da notificação
     * @param {Object} client - Cliente de banco de dados (opcional para transações)
     * @returns {Promise<Object>} - A notificação criada
     */
    static async criarNotificacao(dadosNotificacao, client = null) {
        try {
            // Validação dos dados obrigatórios
            if (!dadosNotificacao.usuario_id) {
                throw new AppError('ID do usuário é obrigatório', 400);
            }
            
            if (!dadosNotificacao.tipo) {
                throw new AppError('Tipo da notificação é obrigatório', 400);
            }
            
            if (!dadosNotificacao.titulo) {
                throw new AppError('Título da notificação é obrigatório', 400);
            }
            
            if (!dadosNotificacao.mensagem) {
                throw new AppError('Mensagem da notificação é obrigatória', 400);
            }
            
            // Cria a notificação no banco de dados
            const notificacao = await NotificacaoModel.criarNotificacao({
                usuario_id: dadosNotificacao.usuario_id,
                tipo: dadosNotificacao.tipo,
                titulo: dadosNotificacao.titulo,
                mensagem: dadosNotificacao.mensagem,
                lida: dadosNotificacao.lida || false,
                dados_adicionais: dadosNotificacao.dados_adicionais || {}
            }, client);
            
            // Aqui você pode adicionar lógica para enviar notificação em tempo real (WebSocket, etc.)
            this.enviarNotificacaoTempoReal(notificacao);
            
            return notificacao;
            
        } catch (error) {
            logger.error('Erro ao criar notificação no serviço:', {
                error: error.message,
                stack: error.stack,
                dadosNotificacao
            });
            throw error;
        }
    }
    
    /**
     * Envia notificação em tempo real (ex: via WebSocket)
     * @param {Object} notificacao - Dados da notificação
     * @private
     */
    static enviarNotificacaoTempoReal(notificacao) {
        try {
            // Implementação de exemplo para WebSocket
            // Você precisará configurar seu servidor WebSocket para enviar a notificação
            // para o cliente específico (usando o usuário_id)
            if (global.io) {
                global.io.to(`user_${notificacao.usuario_id}`).emit('nova_notificacao', notificacao);
            }
        } catch (error) {
            logger.error('Erro ao enviar notificação em tempo real:', {
                error: error.message,
                stack: error.stack,
                notificacaoId: notificacao?.id
            });
            // Não lançamos o erro para não afetar o fluxo principal
        }
    }
    
    /**
     * Marca uma notificação como lida
     * @param {number} notificacaoId - ID da notificação
     * @param {number} usuarioId - ID do usuário (para validação de segurança)
     * @param {Object} client - Cliente de banco de dados (opcional para transações)
     * @returns {Promise<Object>} - A notificação atualizada
     */
    static async marcarComoLida(notificacaoId, usuarioId, client = null) {
        try {
            if (!notificacaoId) {
                throw new AppError('ID da notificação é obrigatório', 400);
            }
            
            if (!usuarioId) {
                throw new AppError('ID do usuário é obrigatório', 400);
            }
            
            const notificacao = await NotificacaoModel.marcarComoLida(notificacaoId, usuarioId, client);
            return notificacao;
            
        } catch (error) {
            logger.error('Erro ao marcar notificação como lida no serviço:', {
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
        try {
            if (!usuarioId) {
                throw new AppError('ID do usuário é obrigatório', 400);
            }
            
            const result = await NotificacaoModel.marcarTodasComoLidas(usuarioId, client);
            return result;
            
        } catch (error) {
            logger.error('Erro ao marcar todas as notificações como lidas no serviço:', {
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
     * @param {number} [options.limit=10] - Limite de resultados por página
     * @param {number} [options.page=1] - Número da página
     * @param {boolean} [options.onlyUnread=false] - Apenas não lidas
     * @returns {Promise<Object>} - Objeto com notificações e metadados de paginação
     */
    static async buscarNotificacoes(usuarioId, { limit = 10, page = 1, onlyUnread = false } = {}) {
        try {
            if (!usuarioId) {
                throw new AppError('ID do usuário é obrigatório', 400);
            }
            
            if (limit < 1 || limit > 100) {
                throw new AppError('O limite deve estar entre 1 e 100', 400);
            }
            
            if (page < 1) {
                throw new AppError('O número da página deve ser maior que 0', 400);
            }
            
            const result = await NotificacaoModel.buscarNotificacoesPorUsuario(
                usuarioId, 
                { limit, page, onlyUnread }
            );
            
            return result;
            
        } catch (error) {
            logger.error('Erro ao buscar notificações no serviço:', {
                error: error.message,
                stack: error.stack,
                usuarioId,
                options: { limit, page, onlyUnread }
            });
            throw error;
        }
    }
    
    /**
     * Busca notificações não lidas de um usuário
     * @param {number} usuarioId - ID do usuário
     * @param {number} [limit=10] - Limite de resultados
     * @returns {Promise<Array>} - Lista de notificações não lidas
     */
    static async buscarNaoLidas(usuarioId, limit = 10) {
        try {
            if (!usuarioId) {
                throw new AppError('ID do usuário é obrigatório', 400);
            }
            
            const notificacoes = await NotificacaoModel.buscarNotificacoesNaoLidas(usuarioId, { limit });
            return notificacoes;
            
        } catch (error) {
            logger.error('Erro ao buscar notificações não lidas no serviço:', {
                error: error.message,
                stack: error.stack,
                usuarioId,
                limit
            });
            throw error;
        }
    }
}

module.exports = NotificacaoService;
