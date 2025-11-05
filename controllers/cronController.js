const db = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { RESERVATION_STATUS } = require('../models/reservaModel');
const emailService = require('../services/emailService');
const { AppError } = require('../utils/AppError');

class CronController {
    /**
     * Verifica e processa reservas PIX expiradas
     * @param {Object} req - Requisição HTTP
     * @param {Object} res - Resposta HTTP
     * @param {Function} next - Próximo middleware
     */
    async verificarReservasExpiradas(req, res, next) {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Busca reservas PIX pendentes de pagamento que já expiraram
            const minutosExpiracao = parseInt(process.env.PIX_CONFIRMATION_TIMEOUT_MINUTES || '30');
            const sql = `
                SELECT r.*, u.nome as usuario_nome, u.email as usuario_email, p.metodo_pagamento
                FROM reservas r
                JOIN usuarios u ON r.usuario_id = u.id
                LEFT JOIN pagamentos p ON r.id = p.reserva_id
                WHERE p.metodo_pagamento = 'pix'
                AND p.status = 'pendente'
                AND r.created_at < NOW() - INTERVAL '${minutosExpiracao} minutes'
                AND r.status = $1
                FOR UPDATE SKIP LOCKED
            `;

            const { rows: reservasExpiradas } = await client.query(sql, [RESERVATION_STATUS.PENDING]);

            if (reservasExpiradas.length === 0) {
                await client.query('COMMIT');
                return res.json({
                    success: true,
                    message: 'Nenhuma reserva PIX expirada encontrada.',
                    reservasProcessadas: 0
                });
            }

            // Atualiza o status das reservas expiradas e dos pagamentos
            const reservaIds = reservasExpiradas.map(r => r.id);

            // Atualiza o status das reservas
            await client.query(
                `UPDATE reservas
                 SET status = $1,
                     updated_at = NOW()
                 WHERE id = ANY($2)`,
                [RESERVATION_STATUS.CANCELLED, reservaIds]
            );

            // Atualiza o status dos pagamentos PIX para 'cancelado'
            await client.query(
                `UPDATE pagamentos
                 SET status = 'cancelado'
                 WHERE reserva_id = ANY($1)
                 AND metodo_pagamento = 'pix'
                 AND status = 'pendente'`,
                [reservaIds]
            );

            await client.query('COMMIT');

            // Envia notificações por e-mail (fora da transação)
            await Promise.all(reservasExpiradas.map(async (reserva) => {
                try {
                    await emailService.enviarEmailCancelamentoReserva({
                        nome: reserva.usuario_nome,
                        email: reserva.usuario_email,
                        reservaId: reserva.id,
                        dataReserva: reserva.created_at,
                        motivo: 'Pagamento não realizado dentro do prazo de 30 minutos.'
                    });

                    logger.info(`Notificação de cancelamento enviada para reserva ${reserva.id}`, {
                        reservaId: reserva.id,
                        usuarioId: reserva.usuario_id,
                        email: reserva.usuario_email
                    });
                } catch (emailError) {
                    logger.error('Erro ao enviar e-mail de cancelamento', {
                        error: emailError.message,
                        reservaId: reserva.id,
                        usuarioId: reserva.usuario_id,
                        stack: emailError.stack
                    });
                }
            }));

            res.json({
                success: true,
                message: `${reservasExpiradas.length} reservas PIX expiradas foram processadas.`,
                reservasProcessadas: reservasExpiradas.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Erro ao processar reservas PIX expiradas:', {
                error: error.message,
                stack: error.stack
            });
            next(new AppError('Erro ao processar reservas PIX expiradas', 500));
        } finally {
            client.release();
        }
    }
    /**
     * Expira reservas pendentes que já passaram do horário de entrada
     */
    async expirarReservasPendentes(req, res, next) {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Busca reservas pendentes cuja data de entrada já passou
            const sql = `
                SELECT r.*, u.nome as usuario_nome, u.email as usuario_email
                FROM reservas r
                JOIN usuarios u ON r.usuario_id = u.id
                WHERE r.status = $1
                AND r.data_entrada_prevista < NOW()
                FOR UPDATE SKIP LOCKED
            `;

            const { rows: reservasExpiradas } = await client.query(sql, [RESERVATION_STATUS.PENDING]);

            if (reservasExpiradas.length === 0) {
                await client.query('COMMIT');
                return res.json({
                    success: true,
                    message: 'Nenhuma reserva pendente expirada encontrada.',
                    reservasProcessadas: 0
                });
            }

            // Atualiza o status das reservas para expirada
            const reservaIds = reservasExpiradas.map(r => r.id);

            await client.query(
                `UPDATE reservas
                 SET status = $1,
                     updated_at = NOW()
                 WHERE id = ANY($2)`,
                [RESERVATION_STATUS.EXPIRED, reservaIds]
            );

            // Libera as vagas associadas
            await client.query(
                `UPDATE vagas
                 SET status = 'livre',
                     reserva_id_ativa = NULL
                 WHERE reserva_id_ativa = ANY($1)`,
                [reservaIds]
            );

            await client.query('COMMIT');

            logger.info(`${reservasExpiradas.length} reservas pendentes expiradas automaticamente`, {
                reservaIds
            });

            res.json({
                success: true,
                message: `${reservasExpiradas.length} reserva(s) pendente(s) expirada(s).`,
                reservasProcessadas: reservasExpiradas.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Erro ao expirar reservas pendentes:', {
                error: error.message,
                stack: error.stack
            });
            next(new AppError('Erro ao expirar reservas pendentes', 500));
        } finally {
            client.release();
        }
    }
}

module.exports = new CronController();
