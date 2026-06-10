// controllers/cronController.js
// Endpoints HTTP para acionar tarefas de manutenção externamente
// (ex.: cron de plataforma/uptime monitor). Protegidos por CRON_API_KEY.
// A lógica de negócio vive nos serviços — o agendador interno
// (services/cronJobs.js) chama os mesmos serviços diretamente, sem HTTP.

const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const PixExpirationService = require('../services/pixExpirationService');
const reservaMaintenanceService = require('../services/reservaMaintenanceService');

class CronController {
    /**
     * Verifica e cancela reservas PIX com pagamento pendente expirado.
     * POST /api/cron/verificar-reservas-expiradas
     */
    async verificarReservasExpiradas(req, res, next) {
        try {
            const { cancelled } = await PixExpirationService.cancelarReservasExpiradas();
            res.json({
                success: true,
                message:
                    cancelled > 0
                        ? `${cancelled} reservas PIX expiradas foram processadas.`
                        : 'Nenhuma reserva PIX expirada encontrada.',
                reservasProcessadas: cancelled,
            });
        } catch (error) {
            logger.error('Erro ao processar reservas PIX expiradas:', {
                error: error.message,
                stack: error.stack,
            });
            next(new AppError('Erro ao processar reservas PIX expiradas', 500));
        }
    }

    /**
     * Expira reservas pendentes cujo horário de entrada já passou.
     * POST /api/cron/expirar-reservas-pendentes
     */
    async expirarReservasPendentes(req, res, next) {
        try {
            const { expired } = await reservaMaintenanceService.expirarReservasPendentes();
            res.json({
                success: true,
                message:
                    expired > 0
                        ? `${expired} reserva(s) pendente(s) expirada(s).`
                        : 'Nenhuma reserva pendente expirada encontrada.',
                reservasProcessadas: expired,
            });
        } catch (error) {
            logger.error('Erro ao expirar reservas pendentes:', {
                error: error.message,
                stack: error.stack,
            });
            next(new AppError('Erro ao expirar reservas pendentes', 500));
        }
    }
}

module.exports = new CronController();
