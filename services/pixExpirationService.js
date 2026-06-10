const db = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { RESERVATION_STATUS } = require('../models/reservaModel');
const emailService = require('./emailService');
const { liberarVagasDasReservas } = require('./reservaMaintenanceService');

class PixExpirationService {
    /**
     * Cancela automaticamente reservas PIX não pagas que expiraram
     * @returns {Promise<{cancelled: number, total: number}>} Número de reservas canceladas e total processado
     */
    static async cancelarReservasExpiradas() {
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            // Busca reservas PIX pendentes de pagamento que já expiraram.
            // O intervalo é validado numericamente antes de entrar na query.
            const parsedTimeout = parseInt(process.env.PIX_CONFIRMATION_TIMEOUT_MINUTES || '30', 10);
            const minutosExpiracao = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30;
            const sql = `
                UPDATE reservas r
                SET
                    status = $1,
                    updated_at = NOW()
                FROM pagamentos p
                WHERE
                    r.id = p.reserva_id
                    AND p.metodo_pagamento = 'pix'
                    AND p.status = 'pendente'
                    AND r.created_at < NOW() - ($2 * INTERVAL '1 minute')
                    AND r.status = $3
                RETURNING r.*
            `;

            const result = await client.query(sql, [
                RESERVATION_STATUS.CANCELLED,
                minutosExpiracao,
                RESERVATION_STATUS.PENDING,
            ]);

            if (result.rowCount > 0) {
                // Atualiza também os pagamentos PIX para status 'cancelado'
                const reservaIds = result.rows.map(r => r.id);
                await client.query(
                    `UPDATE pagamentos
                     SET status = 'cancelado'
                     WHERE reserva_id = ANY($1)
                     AND metodo_pagamento = 'pix'
                     AND status = 'pendente'`,
                    [reservaIds]
                );

                // Libera as vagas que ficaram presas em 'reservada' — sem isso
                // cada reserva PIX expirada deixava uma vaga indisponível para sempre.
                const vagasLiberadas = await liberarVagasDasReservas(client, reservaIds);

                logger.info(`Canceladas ${result.rowCount} reservas PIX expiradas; ${vagasLiberadas} vaga(s) liberada(s)`);

                // Notifica os usuários sobre o cancelamento
                await this.notificarCancelamentos(result.rows, client);
            }

            await client.query('COMMIT');

            return {
                cancelled: result.rowCount,
                total: result.rowCount
            };
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Erro ao cancelar reservas PIX expiradas', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Envia notificações de cancelamento para os usuários
     * @param {Array} reservas - Lista de reservas canceladas
     * @param {object} client - Conexão com o banco de dados
     * @returns {Promise<void>}
     */
    static async notificarCancelamentos(reservas, client) {
        try {
            // Busca detalhes dos usuários para enviar os e-mails
            const userIds = [...new Set(reservas.map(r => r.usuario_id))];
            const { rows: usuarios } = await client.query(
                'SELECT id, nome, email FROM usuarios WHERE id = ANY($1)',
                [userIds]
            );

            const usuariosMap = new Map(usuarios.map(u => [u.id, u]));

            // Envia e-mail para cada reserva cancelada
            await Promise.all(reservas.map(async (reserva) => {
                const usuario = usuariosMap.get(reserva.usuario_id);
                if (!usuario) return;

                try {
                    await emailService.enviarEmailCancelamentoReserva({
                        nome: usuario.nome,
                        email: usuario.email,
                        reservaId: reserva.id,
                        dataReserva: reserva.data_criacao,
                        motivo: 'Pagamento não realizado dentro do prazo de 30 minutos.'
                    });

                    logger.info(`Notificação de cancelamento enviada para reserva ${reserva.id}`, {
                        reservaId: reserva.id,
                        usuarioId: usuario.id,
                        email: usuario.email
                    });
                } catch (emailError) {
                    logger.error('Erro ao enviar e-mail de cancelamento', {
                        error: emailError.message,
                        reservaId: reserva.id,
                        usuarioId: usuario.id,
                        stack: emailError.stack
                    });
                }
            }));
        } catch (error) {
            logger.error('Erro no processo de notificação de cancelamentos', {
                error: error.message,
                stack: error.stack
            });
            // Não propaga o erro para não afetar o fluxo principal
        }
    }
}

module.exports = PixExpirationService;
