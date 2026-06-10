// services/reservaMaintenanceService.js
// Tarefas de manutenção de reservas executadas pelo agendador interno
// (services/cronJobs.js) e expostas via /api/cron/* para acionamento externo.

const db = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { RESERVATION_STATUS } = require('../models/reservaModel');

/**
 * Libera as vagas associadas a um conjunto de reservas encerradas
 * (expiradas/canceladas). Sem isso as vagas ficam presas em 'reservada'
 * para sempre, já que `reserva_id_ativa` só é preenchido na confirmação.
 *
 * @param {object} client - Conexão/transação ativa do pg
 * @param {number[]} reservaIds - IDs das reservas encerradas
 * @returns {Promise<number>} Quantidade de vagas liberadas
 */
async function liberarVagasDasReservas(client, reservaIds) {
    if (!reservaIds || reservaIds.length === 0) return 0;
    const { rowCount } = await client.query(
        `UPDATE vagas v
            SET status = 'livre',
                reserva_id_ativa = NULL
           FROM reservas r
          WHERE r.id = ANY($1)
            AND v.id = r.vaga_id
            AND (v.status = 'reservada' OR v.reserva_id_ativa = r.id)`,
        [reservaIds]
    );
    return rowCount;
}

/**
 * Expira reservas pendentes cujo horário de entrada já passou sem check-in,
 * liberando as vagas associadas.
 *
 * @returns {Promise<{expired: number, reservas: Array}>}
 */
async function expirarReservasPendentes() {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const { rows: reservasExpiradas } = await client.query(
            `SELECT r.*, u.nome AS usuario_nome, u.email AS usuario_email
               FROM reservas r
               JOIN usuarios u ON r.usuario_id = u.id
              WHERE r.status = $1
                AND r.data_entrada_prevista < NOW()
                AND r.data_entrada_real IS NULL
              FOR UPDATE OF r SKIP LOCKED`,
            [RESERVATION_STATUS.PENDING]
        );

        if (reservasExpiradas.length === 0) {
            await client.query('COMMIT');
            return { expired: 0, reservas: [] };
        }

        const reservaIds = reservasExpiradas.map((r) => r.id);

        await client.query(
            `UPDATE reservas
                SET status = $1,
                    updated_at = NOW()
              WHERE id = ANY($2)`,
            [RESERVATION_STATUS.EXPIRED, reservaIds]
        );

        const vagasLiberadas = await liberarVagasDasReservas(client, reservaIds);

        await client.query('COMMIT');

        logger.info(
            `${reservasExpiradas.length} reserva(s) pendente(s) expirada(s); ${vagasLiberadas} vaga(s) liberada(s).`,
            { reservaIds }
        );

        return { expired: reservasExpiradas.length, reservas: reservasExpiradas };
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao expirar reservas pendentes:', {
            error: error.message,
            stack: error.stack,
        });
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    expirarReservasPendentes,
    liberarVagasDasReservas,
};
