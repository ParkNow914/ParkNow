/**
 * Admin Splits Controller
 * Gerencia estatísticas e visualização de splits para administradores
 */

const { sequelize, QueryTypes } = require('../config/db');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

class AdminSplitsController {
    /**
     * Retorna estatísticas gerais de splits
     * @route GET /api/admin/splits/estatisticas
     * @access Private (Admin plataforma)
     */
    async obterEstatisticas(req, res, next) {
        try {
            // Receita total (todos os tempos)
            const receitaTotal = await sequelize.query(`
                SELECT COALESCE(SUM(comissao_plataforma), 0) as total
                FROM pagamentos
                WHERE status = 'approved'
                  AND comissao_plataforma > 0
            `, {
                type: QueryTypes.SELECT,
                plain: true
            });

            // Total de transações com split
            const totalTransacoes = await sequelize.query(`
                SELECT COUNT(*) as total
                FROM pagamentos
                WHERE comissao_plataforma > 0
            `, {
                type: QueryTypes.SELECT,
                plain: true
            });

            // Receita hoje
            const receitaHoje = await sequelize.query(`
                SELECT COALESCE(SUM(comissao_plataforma), 0) as total
                FROM pagamentos
                WHERE status = 'approved'
                  AND comissao_plataforma > 0
                  AND DATE(created_at) = CURRENT_DATE
            `, {
                type: QueryTypes.SELECT,
                plain: true
            });

            // Receita mês atual
            const receitaMes = await sequelize.query(`
                SELECT COALESCE(SUM(comissao_plataforma), 0) as total
                FROM pagamentos
                WHERE status = 'approved'
                  AND comissao_plataforma > 0
                  AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
                  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
            `, {
                type: QueryTypes.SELECT,
                plain: true
            });

            // Top 5 estacionamentos por receita
            const topEstacionamentos = await sequelize.query(`
                SELECT 
                    e.id,
                    e.nome,
                    COUNT(p.id) as total_transacoes,
                    SUM(p.comissao_plataforma) as receita_gerada
                FROM pagamentos p
                JOIN estacionamentos e ON e.id = p.id_estacionamento
                WHERE p.status = 'approved'
                  AND p.comissao_plataforma > 0
                GROUP BY e.id, e.nome
                ORDER BY receita_gerada DESC
                LIMIT 5
            `, {
                type: QueryTypes.SELECT
            });

            res.json({
                success: true,
                data: {
                    receita_total: parseFloat(receitaTotal.total),
                    total_transacoes: parseInt(totalTransacoes.total),
                    receita_hoje: parseFloat(receitaHoje.total),
                    receita_mes: parseFloat(receitaMes.total),
                    top_estacionamentos: topEstacionamentos
                }
            });

        } catch (error) {
            logger.error('Erro ao obter estatísticas de splits:', {
                error: error.message
            });
            next(error);
        }
    }

    /**
     * Lista todas as transações com split
     * @route GET /api/admin/splits/transacoes
     * @access Private (Admin plataforma)
     */
    async listarTransacoes(req, res, next) {
        try {
            const {
                data_inicio,
                data_fim,
                estacionamento_id,
                limite = 100
            } = req.query;

            let whereConditions = ['p.comissao_plataforma > 0'];
            const replacements = [];

            if (data_inicio) {
                whereConditions.push('p.created_at >= ?');
                replacements.push(data_inicio);
            }

            if (data_fim) {
                whereConditions.push('p.created_at <= ?');
                replacements.push(data_fim);
            }

            if (estacionamento_id) {
                whereConditions.push('p.id_estacionamento = ?');
                replacements.push(estacionamento_id);
            }

            const whereClause = whereConditions.join(' AND ');

            const transacoes = await sequelize.query(`
                SELECT 
                    p.id,
                    p.created_at,
                    p.valor as valor_total,
                    p.comissao_plataforma,
                    p.valor_estacionamento,
                    p.status,
                    p.metodo,
                    e.nome as estacionamento_nome,
                    u.nome as cliente_nome,
                    u.email as cliente_email,
                    r.id as reserva_id
                FROM pagamentos p
                JOIN estacionamentos e ON e.id = p.id_estacionamento
                JOIN usuarios u ON u.id = p.id_usuario
                LEFT JOIN reservas r ON r.id = p.reserva_id
                WHERE ${whereClause}
                ORDER BY p.created_at DESC
                LIMIT ?
            `, {
                replacements: [...replacements, parseInt(limite)],
                type: QueryTypes.SELECT
            });

            res.json({
                success: true,
                data: transacoes
            });

        } catch (error) {
            logger.error('Erro ao listar transações:', {
                error: error.message,
                query: req.query
            });
            next(error);
        }
    }

    /**
     * Obter detalhes de uma transação específica
     * @route GET /api/admin/splits/transacoes/:id
     * @access Private (Admin plataforma)
     */
    async obterDetalheTransacao(req, res, next) {
        try {
            const { id } = req.params;

            const transacao = await sequelize.query(`
                SELECT 
                    p.*,
                    e.nome as estacionamento_nome,
                    e.endereco as estacionamento_endereco,
                    e.asaas_wallet_id,
                    u.nome as cliente_nome,
                    u.email as cliente_email,
                    u.telefone as cliente_telefone,
                    r.data_entrada_prevista,
                    r.data_saida_prevista,
                    r.placa_veiculo,
                    r.status as reserva_status
                FROM pagamentos p
                JOIN estacionamentos e ON e.id = p.id_estacionamento
                JOIN usuarios u ON u.id = p.id_usuario
                LEFT JOIN reservas r ON r.id = p.reserva_id
                WHERE p.id = ?
            `, {
                replacements: [id],
                type: QueryTypes.SELECT,
                plain: true
            });

            if (!transacao) {
                throw new AppError('Transação não encontrada', 404);
            }

            res.json({
                success: true,
                data: transacao
            });

        } catch (error) {
            logger.error('Erro ao obter detalhes da transação:', {
                error: error.message,
                id: req.params.id
            });
            next(error);
        }
    }

    /**
     * Exportar relatório de splits (CSV)
     * @route GET /api/admin/splits/exportar
     * @access Private (Admin plataforma)
     */
    async exportarRelatorio(req, res, next) {
        try {
            const { data_inicio, data_fim } = req.query;

            let whereConditions = ['p.comissao_plataforma > 0', 'p.status = ?'];
            const replacements = ['approved'];

            if (data_inicio) {
                whereConditions.push('p.created_at >= ?');
                replacements.push(data_inicio);
            }

            if (data_fim) {
                whereConditions.push('p.created_at <= ?');
                replacements.push(data_fim);
            }

            const whereClause = whereConditions.join(' AND ');

            const transacoes = await sequelize.query(`
                SELECT 
                    p.id,
                    p.created_at,
                    e.nome as estacionamento,
                    u.nome as cliente,
                    p.valor as valor_total,
                    p.comissao_plataforma,
                    p.valor_estacionamento,
                    p.metodo
                FROM pagamentos p
                JOIN estacionamentos e ON e.id = p.id_estacionamento
                JOIN usuarios u ON u.id = p.id_usuario
                WHERE ${whereClause}
                ORDER BY p.created_at DESC
            `, {
                replacements,
                type: QueryTypes.SELECT
            });

            // Gerar CSV
            let csv = 'ID,Data,Estacionamento,Cliente,Valor Total,Comissão ParkNow,Valor Estacionamento,Método\n';
            
            transacoes.forEach(t => {
                csv += `${t.id},"${new Date(t.created_at).toLocaleString('pt-BR')}","${t.estacionamento}","${t.cliente}",${t.valor_total},${t.comissao_plataforma},${t.valor_estacionamento},"${t.metodo}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=splits_${Date.now()}.csv`);
            res.send(csv);

        } catch (error) {
            logger.error('Erro ao exportar relatório:', {
                error: error.message
            });
            next(error);
        }
    }
}

module.exports = new AdminSplitsController();
