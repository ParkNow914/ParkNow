// services/cronJobs.js
// Define e agenda tarefas recorrentes usando node-cron.
//
// As tarefas chamam os serviços diretamente (sem HTTP para a própria API,
// que era frágil e dependia de CRON_API_KEY). Os endpoints /api/cron/*
// continuam existindo para acionamento EXTERNO (ex.: scheduler de plataforma).

const cron = require('node-cron');
const logger = require('../utils/logger');
const vagaModel = require('../models/vagaModel');
const config = require('../config');
const PixExpirationService = require('./pixExpirationService');
const reservaMaintenanceService = require('./reservaMaintenanceService');

const CRON_OPTIONS = { scheduled: true, timezone: 'America/Sao_Paulo' };

function scheduleJob(name, schedule, task) {
    if (!cron.validate(schedule)) {
        logger.error(`[Cron] Schedule inválido para '${name}': ${schedule}. Tarefa não agendada.`);
        return;
    }
    logger.info(`[Cron] Agendando '${name}' com schedule: '${schedule}'`);
    cron.schedule(schedule, async () => {
        logger.debug(`[Cron] Executando '${name}'...`);
        try {
            await task();
        } catch (error) {
            logger.error(`[Cron] Erro durante a execução de '${name}':`, {
                error: error.message,
                stack: error.stack,
            });
        }
    }, CRON_OPTIONS);
}

function initCronJobs() {
    logger.info('[Cron] Inicializando serviço de tarefas agendadas...');

    // --- Tarefa 1: Expirar reservas pendentes não utilizadas ---
    // (horário de entrada já passou sem check-in; libera as vagas associadas)
    scheduleJob('expirarReservasPendentes', config.cron.expireReservasSchedule, async () => {
        const { expired } = await reservaMaintenanceService.expirarReservasPendentes();
        if (expired > 0) {
            logger.info(`[Cron] ${expired} reservas expiradas foram processadas e vagas liberadas.`);
        } else {
            logger.debug('[Cron] Nenhuma reserva expirada encontrada.');
        }
    });

    // --- Tarefa 2: Cancelar reservas PIX com pagamento pendente expirado ---
    scheduleJob('cancelarReservasPixExpiradas', '*/5 * * * *', async () => {
        const { cancelled } = await PixExpirationService.cancelarReservasExpiradas();
        if (cancelled > 0) {
            logger.info(`[Cron] ${cancelled} reservas PIX expiradas foram canceladas.`);
        } else {
            logger.debug('[Cron] Nenhuma reserva PIX expirada encontrada.');
        }
    });

    // --- Tarefa 3: Atualizar tempo estacionado no banco de dados ---
    scheduleJob('updateAllTemposEstacionados', config.cron.updateTempoSchedule, async () => {
        const affectedRows = await vagaModel.updateAllTemposEstacionados();
        if (affectedRows > 0) {
            logger.debug(`[Cron] Tempos estacionados no DB atualizados para ${affectedRows} vagas.`);
        }
    });

    logger.info('[Cron] Configuração de tarefas agendadas concluída.');
}

module.exports = initCronJobs;
