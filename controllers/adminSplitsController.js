/**
 * Admin Transactions Controller
 *
 * Histórico de pagamentos no modelo always-free (PIX manual): não há split
 * automático nem comissão de plataforma. Mantemos as rotas existentes
 * (`/admin/splits/...`) para compatibilidade com o frontend já deployado,
 * mas o conteúdo passa a refletir apenas o histórico de transações PIX
 * confirmadas / pendentes pelo admin.
 */

const { sequelize, QueryTypes } = require('../config/db');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

class AdminSplitsController {
    /**
     * Estatísticas gerais de pagamentos (sem split — plataforma always free).
     */
    async obterEstatisticas(req, res, next) {
        try {
            const valorTotal = await sequelize.query(
                `SELECT COALESCE(SUM(valor), 0) AS total
                   FROM pagamentos
                  WHERE status IN ('aprovado', 'pago')`,
                { type: QueryTypes.SELECT, plain: true }
            );

            const totalTransacoes = await sequelize.query(
                `SELECT COUNT(*) AS total FROM pagamentos`,
                { type: QueryTypes.SELECT, plain: true }
            );

            const totalHoje = await sequelize.query(
                `SELECT COALESCE(SUM(valor), 0) AS total
                   FROM pagamentos
                  WHERE status IN ('aprovado', 'pago')
                    AND DATE(created_at) = CURRENT_DATE`,
                { type: QueryTypes.SELECT, plain: true }
            );

            const totalMes = await sequelize.query(
                `SELECT COALESCE(SUM(valor), 0) AS total
                   FROM pagamentos
                  WHERE status IN ('aprovado', 'pago')
                    AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
                    AND EXTRACT(YEAR FROM created_at)  = EXTRACT(YEAR FROM CURRENT_DATE)`,
                { type: QueryTypes.SELECT, plain: true }
            );

            const topEstacionamentos = await sequelize.query(
                `SELECT e.id, e.nome,
                        COUNT(p.id)                  AS total_transacoes,
                        COALESCE(SUM(p.valor), 0)    AS volume
                   FROM pagamentos p
                   JOIN estacionamentos e ON e.id = p.id_estacionamento
                  WHERE p.status IN ('aprovado', 'pago')
                  GROUP BY e.id, e.nome
                  ORDER BY volume DESC
                  LIMIT 5`,
                { type: QueryTypes.SELECT }
            );

            res.json({
                success: true,
                data: {
                    receita_total: parseFloat(valorTotal.total),
                    total_transacoes: parseInt(totalTransacoes.total, 10),
                    receita_hoje: parseFloat(totalHoje.total),
                    receita_mes: parseFloat(totalMes.total),
                    top_estacionamentos: topEstacionamentos,
                    // Sempre 0 — modelo always free, sem comissão da plataforma.
                    comissao_total: 0,
                },
            });
        } catch (error) {
            logger.error('Erro ao obter estatísticas de transações:', { error: error.message });
            next(error);
        }
    }

    /**
     * Lista as transações confirmadas/pendentes.
     */
    async listarTransacoes(req, res, next) {
        try {
            const { data_inicio, data_fim, estacionamento_id, limite = 100 } = req.query;

            const where = ['1=1'];
            const replacements = [];

            if (data_inicio) { where.push('p.created_at >= ?'); replacements.push(data_inicio); }
            if (data_fim)    { where.push('p.created_at <= ?'); replacements.push(data_fim); }
            if (estacionamento_id) {
                where.push('p.id_estacionamento = ?');
                replacements.push(estacionamento_id);
            }

            const transacoes = await sequelize.query(
                `SELECT p.id,
                        p.created_at,
                        p.valor          AS valor_total,
                        p.status,
                        p.metodo_pagamento AS metodo,
                        e.nome           AS estacionamento_nome,
                        u.nome           AS cliente_nome,
                        u.email          AS cliente_email,
                        r.id             AS reserva_id
                   FROM pagamentos p
                   JOIN estacionamentos e ON e.id = p.id_estacionamento
                   JOIN usuarios u        ON u.id = p.id_usuario
                   LEFT JOIN reservas r   ON r.id = p.reserva_id
                  WHERE ${where.join(' AND ')}
                  ORDER BY p.created_at DESC
                  LIMIT ?`,
                {
                    replacements: [...replacements, parseInt(limite, 10)],
                    type: QueryTypes.SELECT,
                }
            );

            res.json({ success: true, data: transacoes });
        } catch (error) {
            logger.error('Erro ao listar transações:', { error: error.message, query: req.query });
            next(error);
        }
    }

    async obterDetalheTransacao(req, res, next) {
        try {
            const { id } = req.params;
            const transacao = await sequelize.query(
                `SELECT p.*,
                        e.nome     AS estacionamento_nome,
                        e.endereco AS estacionamento_endereco,
                        u.nome     AS cliente_nome,
                        u.email    AS cliente_email,
                        u.telefone AS cliente_telefone,
                        r.data_entrada_prevista,
                        r.data_saida_prevista,
                        r.placa_veiculo,
                        r.status   AS reserva_status
                   FROM pagamentos p
                   JOIN estacionamentos e ON e.id = p.id_estacionamento
                   JOIN usuarios u        ON u.id = p.id_usuario
                   LEFT JOIN reservas r   ON r.id = p.reserva_id
                  WHERE p.id = ?`,
                { replacements: [id], type: QueryTypes.SELECT, plain: true }
            );

            if (!transacao) throw new AppError('Transação não encontrada', 404);
            res.json({ success: true, data: transacao });
        } catch (error) {
            logger.error('Erro ao obter detalhes da transação:', {
                error: error.message,
                id: req.params.id,
            });
            next(error);
        }
    }

    async exportarRelatorio(req, res, next) {
        try {
            const { data_inicio, data_fim } = req.query;

            const where = [`p.status IN ('aprovado', 'pago')`];
            const replacements = [];

            if (data_inicio) { where.push('p.created_at >= ?'); replacements.push(data_inicio); }
            if (data_fim)    { where.push('p.created_at <= ?'); replacements.push(data_fim); }

            const transacoes = await sequelize.query(
                `SELECT p.id, p.created_at,
                        e.nome AS estacionamento,
                        u.nome AS cliente,
                        p.valor AS valor_total,
                        p.metodo_pagamento AS metodo
                   FROM pagamentos p
                   JOIN estacionamentos e ON e.id = p.id_estacionamento
                   JOIN usuarios u        ON u.id = p.id_usuario
                  WHERE ${where.join(' AND ')}
                  ORDER BY p.created_at DESC`,
                { replacements, type: QueryTypes.SELECT }
            );

            let csv = 'ID,Data,Estacionamento,Cliente,Valor,Método\n';
            transacoes.forEach((t) => {
                csv += `${t.id},"${new Date(t.created_at).toLocaleString('pt-BR')}","${t.estacionamento}","${t.cliente}",${t.valor_total},"${t.metodo}"\n`;
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=transacoes_${Date.now()}.csv`);
            res.send(csv);
        } catch (error) {
            logger.error('Erro ao exportar relatório:', { error: error.message });
            next(error);
        }
    }
}

module.exports = new AdminSplitsController();
