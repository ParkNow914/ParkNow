const logger = require('../utils/logger');
const db = require('../config/database');
const { getIO } = require('../services/socketService');
const { format } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const { formatarMoeda } = require('../utils/formatters');

class NotificationService {
    /**
     * Envia uma notificação para um usuário específico
     * @param {number} userId - ID do usuário destinatário
     * @param {Object} notification - Objeto de notificação
     * @param {string} notification.tipo - Tipo da notificação (ex: 'pagamento_aprovado', 'reserva_cancelada')
     * @param {string} notification.titulo - Título da notificação
     * @param {string} notification.mensagem - Mensagem da notificação
     * @param {Object} [notification.dados] - Dados adicionais da notificação
     * @param {boolean} [notification.salvar=true] - Se deve salvar a notificação no banco de dados
     * @returns {Promise<Object>} Notificação salva
     */
    async enviarNotificacao(userId, { tipo, titulo, mensagem, dados = {}, salvar = true }) {
        try {
            const notificacao = {
                usuario_id: userId,
                tipo,
                titulo,
                mensagem,
                dados: JSON.stringify(dados),
                lida: false,
                data_criacao: new Date()
            };

            // Salva a notificação no banco de dados se necessário
            if (salvar) {
                try {
                    const query = `
                        INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, dados, lida, data_criacao)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING id
                    `;
                    const result = await db.query(query, [
                        notificacao.usuario_id,
                        notificacao.tipo,
                        notificacao.titulo,
                        notificacao.mensagem,
                        notificacao.dados,
                        notificacao.lida,
                        notificacao.data_criacao
                    ]);

                    if (result.rows && result.rows.length > 0) {
                        notificacao.id = result.rows[0].id;
                    }
                } catch (dbError) {
                    // Se a tabela não existir, apenas loga o erro e continua
                    logger.warn('Não foi possível salvar notificação no banco de dados:', dbError.message);
                }
            }

            // Envia a notificação em tempo real via Socket.IO
            const io = getIO();
            if (io) {
                io.to(`usuario_${userId}`).emit('nova_notificacao', {
                    ...notificacao,
                    dados: typeof notificacao.dados === 'string' ?
                        JSON.parse(notificacao.dados) : notificacao.dados
                });
            }

            logger.info(`Notificação enviada para o usuário ${userId}`, { tipo, titulo });
            return notificacao;
        } catch (error) {
            logger.error('Erro ao enviar notificação:', error);
            // Não lança o erro para não interromper o fluxo principal
            return null;
        }
    }

    /**
     * Marca uma notificação como lida
     * @param {number} notificacaoId - ID da notificação
     * @param {number} userId - ID do usuário (para validação de segurança)
     * @returns {Promise<boolean>} True se a notificação foi marcada como lida
     */
    async marcarComoLida(notificacaoId, userId) {
        try {
            const query = `
                UPDATE notificacoes
                SET lida = true, data_leitura = NOW()
                WHERE id = $1 AND usuario_id = $2
                RETURNING *
            `;
            const result = await db.query(query, [notificacaoId, userId]);

            return result.rows && result.rows.length > 0;
        } catch (error) {
            logger.error('Erro ao marcar notificação como lida:', error);
            throw error;
        }
    }

    /**
     * Obtém as notificações não lidas de um usuário
     * @param {number} userId - ID do usuário
     * @param {Object} [options] - Opções de consulta
     * @param {number} [options.limit=20] - Limite de notificações
     * @param {number} [options.offset=0] - Deslocamento para paginação
     * @returns {Promise<Array>} Lista de notificações
     */
    async obterNotificacoesNaoLidas(userId, { limit = 20, offset = 0 } = {}) {
        try {
            const query = `
                SELECT * FROM notificacoes
                WHERE usuario_id = $1 AND lida = false
                ORDER BY data_criacao DESC
                LIMIT $2 OFFSET $3
            `;
            const result = await db.query(query, [userId, limit, offset]);

            // Converte os dados de string JSON para objeto
            return result.rows.map(notif => ({
                ...notif,
                dados: notif.dados ? JSON.parse(notif.dados) : {}
            }));
        } catch (error) {
            logger.error('Erro ao obter notificações não lidas:', error);
            return [];
        }
    }

    /**
     * Envia uma notificação para múltiplos usuários
     * @param {Array<number>} userIds - IDs dos usuários destinatários
     * @param {Object} notificacao - Objeto de notificação
     * @returns {Promise<Array>} Resultados das notificações
     */
    async enviarNotificacaoEmMassa(userIds, notificacao) {
        try {
            const results = await Promise.all(
                userIds.map(userId =>
                    this.enviarNotificacao(userId, notificacao)
                        .catch(error => ({
                            userId,
                            success: false,
                            error: error.message
                        }))
                )
            );

            return results;
        } catch (error) {
            logger.error('Erro ao enviar notificação em massa:', error);
            throw error;
        }
    }

    /**
     * Envia notificação de pagamento aprovado
     * @param {number} userId - ID do usuário
     * @param {number} reservaId - ID da reserva
     * @param {number} valor - Valor do pagamento
     * @returns {Promise<Object>} Notificação enviada
     */
    async enviarNotificacaoPagamentoAprovado(userId, reservaId, valor) {
        return this.enviarNotificacao(userId, {
            tipo: 'pagamento_aprovado',
            titulo: 'Pagamento Aprovado!',
            mensagem: `Seu pagamento de ${formatarMoeda(valor)} foi aprovado com sucesso. ` +
                     'Sua reserva está confirmada!',
            dados: {
                reservaId,
                valor,
                data: new Date().toISOString()
            },
            salvar: true
        });
    }

    /**
     * Envia notificação de falha no pagamento
     * @param {number} userId - ID do usuário
     * @param {number} reservaId - ID da reserva
     * @param {string} motivo - Motivo da falha
     * @param {string} [mensagem] - Mensagem adicional
     * @returns {Promise<Object>} Notificação enviada
     */
    async enviarNotificacaoPagamentoFalhou(userId, reservaId, motivo, mensagem = '') {
        return this.enviarNotificacao(userId, {
            tipo: 'pagamento_falhou',
            titulo: 'Pagamento Não Aprovado',
            mensagem: `Não foi possível processar seu pagamento. ${mensagem}`.trim(),
            dados: {
                reservaId,
                motivo,
                data: new Date().toISOString(),
                acoes: [
                    { texto: 'Tentar Novamente', acao: 'tentar_novamente', rota: `/reservas/${reservaId}/pagamento` },
                    { texto: 'Escolher Outro Método', acao: 'escolher_metodo', rota: '/metodos-pagamento' }
                ]
            },
            salvar: true
        });
    }

    /**
     * Envia notificação de reembolso processado
     * @param {number} userId - ID do usuário
     * @param {number} valor - Valor do reembolso
     * @param {string} metodo - Método de reembolso
     * @param {Object} [detalhes] - Detalhes adicionais
     * @returns {Promise<Object>} Notificação enviada
     */
    async enviarNotificacaoReembolsoProcessado(userId, valor, metodo, detalhes = {}) {
        const mensagemMetodo = {
            'pix': 'via PIX',
            'cartao_credito': 'para o cartão de crédito',
            'cartao_debito': 'para o cartão de débito',
            'conta_bancaria': 'para sua conta bancária'
        }[metodo] || '';

        return this.enviarNotificacao(userId, {
            tipo: 'reembolso_processado',
            titulo: 'Reembolso Processado',
            mensagem: `Seu reembolso de ${formatarMoeda(valor)} ${mensagemMetodo} foi processado. ` +
                     'O valor pode levar até 5 dias úteis para aparecer em sua conta.',
            dados: {
                valor,
                metodo,
                data: new Date().toISOString(),
                ...detalhes
            },
            salvar: true
        });
    }

    /**
     * Envia notificação de pagamento pendente
     * @param {number} userId - ID do usuário
     * @param {number} reservaId - ID da reserva
     * @param {string} metodo - Método de pagamento
     * @param {Date} dataExpiracao - Data de expiração do pagamento
     * @returns {Promise<Object>} Notificação enviada
     */
    async enviarNotificacaoPagamentoPendente(userId, reservaId, metodo, dataExpiracao) {
        const formatarData = (data) => {
            return format(data, "dd 'de' MMMM 'às' HH:mm", { locale: ptBR });
        };

        return this.enviarNotificacao(userId, {
            tipo: 'pagamento_pendente',
            titulo: 'Pagamento Pendente',
            mensagem: `Seu pagamento está aguardando confirmação. ` +
                     `Você tem até ${formatarData(dataExpiracao)} para concluir o pagamento.`,
            dados: {
                reservaId,
                metodo,
                dataExpiracao: dataExpiracao.toISOString(),
                acoes: [
                    { texto: 'Ver Detalhes', acao: 'ver_detalhes', rota: `/reservas/${reservaId}` },
                    { texto: 'Tentar Novamente', acao: 'tentar_novamente', rota: `/reservas/${reservaId}/pagamento` }
                ]
            },
            salvar: true
        });
    }

    /**
     * Envia notificação de pagamento atrasado
     * @param {number} userId - ID do usuário
     * @param {number} reservaId - ID da reserva
     * @param {string} motivo - Motivo do atraso
     * @returns {Promise<Object>} Notificação enviada
     */
    async enviarNotificacaoPagamentoAtrasado(userId, reservaId, motivo = '') {
        return this.enviarNotificacao(userId, {
            tipo: 'pagamento_atrasado',
            titulo: 'Pagamento Atrasado',
            mensagem: `Seu pagamento não foi identificado dentro do prazo. ${motivo}`.trim(),
            dados: {
                reservaId,
                motivo,
                data: new Date().toISOString(),
                acoes: [
                    { texto: 'Tentar Novamente', acao: 'tentar_novamente', rota: `/reservas/${reservaId}/pagamento` },
                    { texto: 'Falar com o Suporte', acao: 'suporte', rota: '/ajuda' }
                ]
            },
            salvar: true
        });
    }
}

module.exports = new NotificationService();
