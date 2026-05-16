/**
 * Controlador para gerenciar a conexão entre Estacionamentos e ASAAS
 * 
 * Responsável por:
 * - Criar subconta ASAAS para o estacionamento
 * - Vincular wallet_id ao estacionamento no banco
 * - Consultar status da conexão
 */

const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const asaasMarketplaceService = require('../services/asaasMarketplaceService');
const db = require('../config/db');

class EstacionamentoAsaasController {
    /**
     * Conectar estacionamento ao ASAAS (criar subconta)
     * POST /api/admin/estacionamentos/:id/conectar-asaas
     */
    async conectarAsaas(req, res, next) {
        const { id: estacionamentoId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        try {
            logger.info('Iniciando conexão com ASAAS:', {
                estacionamento_id: estacionamentoId,
                user_id: userId,
                role: userRole
            });

            // 1. Buscar dados do estacionamento
            const queryEstacionamento = `
                SELECT 
                    e.id, 
                    e.nome, 
                    e.admin_id,
                    e.asaas_wallet_id,
                    e.asaas_connected_at,
                    a.nome as admin_nome,
                    a.email as admin_email,
                    a.cnpj as admin_cnpj,
                    a.telefone as admin_telefone
                FROM estacionamentos e
                INNER JOIN admins a ON e.admin_id = a.id
                WHERE e.id = $1
            `;

            const { rows } = await db.query(queryEstacionamento, [estacionamentoId]);

            if (rows.length === 0) {
                throw new AppError('Estacionamento não encontrado', 404);
            }

            const estacionamento = rows[0];

            // 2. Verificar se o usuário tem permissão
            if (userRole !== 'admin' && estacionamento.admin_id !== userId) {
                throw new AppError('Você não tem permissão para conectar este estacionamento ao ASAAS', 403);
            }

            // 3. Verificar se já está conectado
            if (estacionamento.asaas_wallet_id) {
                logger.warn('Estacionamento já conectado ao ASAAS:', {
                    estacionamento_id: estacionamentoId,
                    wallet_id: estacionamento.asaas_wallet_id,
                    connected_at: estacionamento.asaas_connected_at
                });

                return res.status(200).json({
                    success: true,
                    message: 'Estacionamento já está conectado ao ASAAS',
                    data: {
                        estacionamento_id: estacionamento.id,
                        wallet_id: estacionamento.asaas_wallet_id,
                        connected_at: estacionamento.asaas_connected_at
                    }
                });
            }

            // 4. Verificar dados obrigatórios do admin
            if (!estacionamento.admin_email) {
                throw new AppError('Admin sem email cadastrado. Atualize o cadastro do administrador.', 400);
            }

            if (!estacionamento.admin_cnpj) {
                throw new AppError('Admin sem CPF/CNPJ cadastrado. Atualize o cadastro do administrador.', 400);
            }

            // 5. Criar subconta no ASAAS
            logger.info('Criando subconta ASAAS:', {
                nome: estacionamento.nome,
                email: estacionamento.admin_email,
                cnpj: estacionamento.admin_cnpj
            });

            const subconta = await asaasMarketplaceService.criarSubconta({
                nome: estacionamento.nome,
                email: estacionamento.admin_email,
                cpfCnpj: estacionamento.admin_cnpj,
                telefone: estacionamento.admin_telefone || '11999999999' // Telefone padrão se não tiver
            });

            if (!subconta.walletId) {
                throw new AppError('Erro ao criar subconta ASAAS: walletId não retornado', 500);
            }

            logger.info('Subconta ASAAS criada com sucesso:', {
                wallet_id: subconta.walletId,
                estacionamento_id: estacionamentoId
            });

            // 6. Atualizar estacionamento no banco
            const queryUpdate = `
                UPDATE estacionamentos
                SET 
                    asaas_wallet_id = $1,
                    asaas_connected_at = NOW()
                WHERE id = $2
                RETURNING id, asaas_wallet_id, asaas_connected_at
            `;

            const { rows: updated } = await db.query(queryUpdate, [subconta.walletId, estacionamentoId]);

            logger.info('✅ Estacionamento conectado ao ASAAS:', {
                estacionamento_id: estacionamentoId,
                wallet_id: subconta.walletId,
                connected_at: updated[0].asaas_connected_at
            });

            // 7. Retornar sucesso
            return res.status(200).json({
                success: true,
                message: 'Estacionamento conectado ao ASAAS com sucesso!',
                data: {
                    estacionamento_id: updated[0].id,
                    wallet_id: updated[0].asaas_wallet_id,
                    connected_at: updated[0].asaas_connected_at,
                    ambiente: process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'
                }
            });

        } catch (error) {
            logger.error('Erro ao conectar estacionamento ao ASAAS:', {
                error: error.message,
                stack: error.stack,
                estacionamento_id: estacionamentoId
            });

            // Se for erro do ASAAS, passar a mensagem detalhada
            if (error.response?.data) {
                const asaasError = error.response.data;
                const errorMsg = asaasError.errors?.[0]?.description || asaasError.message || 'Erro desconhecido';
                
                return next(new AppError(
                    `Erro ao criar subconta ASAAS: ${errorMsg}`,
                    error.response.status || 500
                ));
            }

            next(error);
        }
    }

    /**
     * Consultar status da conexão ASAAS
     * GET /api/admin/estacionamentos/:id/status-asaas
     */
    async consultarStatusAsaas(req, res, next) {
        const { id: estacionamentoId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        try {
            // Buscar dados do estacionamento
            const query = `
                SELECT 
                    id, 
                    nome,
                    admin_id,
                    asaas_wallet_id,
                    asaas_connected_at
                FROM estacionamentos
                WHERE id = $1
            `;

            const { rows } = await db.query(query, [estacionamentoId]);

            if (rows.length === 0) {
                throw new AppError('Estacionamento não encontrado', 404);
            }

            const estacionamento = rows[0];

            // Verificar permissão
            if (userRole !== 'admin' && estacionamento.admin_id !== userId) {
                throw new AppError('Você não tem permissão para consultar este estacionamento', 403);
            }

            // Retornar status
            return res.status(200).json({
                success: true,
                data: {
                    estacionamento_id: estacionamento.id,
                    nome: estacionamento.nome,
                    conectado: !!estacionamento.asaas_wallet_id,
                    wallet_id: estacionamento.asaas_wallet_id || null,
                    connected_at: estacionamento.asaas_connected_at || null,
                    ambiente: process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'
                }
            });

        } catch (error) {
            logger.error('Erro ao consultar status ASAAS:', {
                error: error.message,
                estacionamento_id: estacionamentoId
            });
            next(error);
        }
    }

    /**
     * Desconectar estacionamento do ASAAS
     * DELETE /api/admin/estacionamentos/:id/desconectar-asaas
     * 
     * ATENÇÃO: Isso NÃO deleta a subconta no ASAAS, apenas remove a referência no banco
     */
    async desconectarAsaas(req, res, next) {
        const { id: estacionamentoId } = req.params;
        const _userId = req.user.id;
        const userRole = req.user.role;

        try {
            // Buscar dados do estacionamento
            const query = `
                SELECT id, nome, admin_id, asaas_wallet_id
                FROM estacionamentos
                WHERE id = $1
            `;

            const { rows } = await db.query(query, [estacionamentoId]);

            if (rows.length === 0) {
                throw new AppError('Estacionamento não encontrado', 404);
            }

            const estacionamento = rows[0];

            // Verificar permissão (apenas admin principal pode desconectar)
            if (userRole !== 'admin') {
                throw new AppError('Apenas administradores podem desconectar estacionamentos do ASAAS', 403);
            }

            if (!estacionamento.asaas_wallet_id) {
                return res.status(200).json({
                    success: true,
                    message: 'Estacionamento já está desconectado do ASAAS'
                });
            }

            // Remover conexão
            const queryUpdate = `
                UPDATE estacionamentos
                SET 
                    asaas_wallet_id = NULL,
                    asaas_connected_at = NULL
                WHERE id = $1
                RETURNING id, nome
            `;

            const { rows: updated } = await db.query(queryUpdate, [estacionamentoId]);

            logger.info('✅ Estacionamento desconectado do ASAAS:', {
                estacionamento_id: estacionamentoId,
                nome: updated[0].nome
            });

            return res.status(200).json({
                success: true,
                message: 'Estacionamento desconectado do ASAAS com sucesso!',
                data: {
                    estacionamento_id: updated[0].id,
                    nome: updated[0].nome
                }
            });

        } catch (error) {
            logger.error('Erro ao desconectar estacionamento do ASAAS:', {
                error: error.message,
                estacionamento_id: estacionamentoId
            });
            next(error);
        }
    }
}

module.exports = new EstacionamentoAsaasController();
