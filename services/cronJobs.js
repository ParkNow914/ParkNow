// services/cronJobs.js
// Define e agenda tarefas recorrentes usando node-cron.

const cron = require('node-cron');              // Biblioteca para agendamento
const axios = require('axios');                  // Para fazer requisições HTTP
const logger = require('../utils/logger');       // Logger Winston
const reservaModel = require('../models/reservaModel'); // Model de Reservas
const vagaModel = require('../models/vagaModel');    // Model de Vagas
const config = require('../config');             // Configurações (schedules)
const _socketService = require('./socketService'); // Para emitir eventos após expirar
const PixExpirationService = require('./pixExpirationService'); // Serviço para expiração de PIX

function initCronJobs() {
    logger.info('[Cron] Inicializando serviço de tarefas agendadas...');

    // --- Tarefa 1: Expirar Reservas Não Utilizadas ---
    const expireSchedule = config.cron.expireReservasSchedule;
    if (cron.validate(expireSchedule)) {
        logger.info(`[Cron] Agendando 'expireUnusedReservas' para rodar com schedule: '${expireSchedule}'`);
        cron.schedule(expireSchedule, async () => {
            logger.info(`[Cron] Executando 'expireUnusedReservas'...`);
            try {
                const count = await reservaModel.expireUnusedReservas();
                if (count > 0) {
                    logger.info(`[Cron] ${count} reservas expiradas foram processadas e vagas liberadas.`);
                } else {
                    logger.info('[Cron] Nenhuma reserva expirada encontrada.');
                }
            } catch (error) {
                logger.error('[Cron] Erro durante a execução de expireUnusedReservas:', error);
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });
    } else {
        logger.error(`[Cron] Schedule inválido para 'expireUnusedReservas': ${expireSchedule}. Tarefa não agendada.`);
    }

    // --- Tarefa 2: Cancelar Reservas PIX Expiradas ---
    const pixExpirationSchedule = '*/5 * * * *'; // A cada 5 minutos
    if (cron.validate(pixExpirationSchedule)) {
        logger.info(`[Cron] Agendando 'cancelarReservasPixExpiradas' para rodar a cada 5 minutos`);
        cron.schedule(pixExpirationSchedule, async () => {
            logger.info('[Cron] Executando verificação de reservas PIX expiradas...');
            try {
                const { cancelled } = await PixExpirationService.cancelarReservasExpiradas();
                if (cancelled > 0) {
                    logger.info(`[Cron] ${cancelled} reservas PIX expiradas foram canceladas.`);
                } else {
                    logger.debug('[Cron] Nenhuma reserva PIX expirada encontrada.');
                }
            } catch (error) {
                logger.error('[Cron] Erro ao cancelar reservas PIX expiradas:', {
                    error: error.message,
                    stack: error.stack
                });
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });
    } else {
        logger.error(`[Cron] Schedule inválido para 'cancelarReservasPixExpiradas': ${pixExpirationSchedule}`);
    }

    // --- Tarefa 3: Atualizar Tempo Estacionado no Banco de Dados ---
    const updateTimeSchedule = config.cron.updateTempoSchedule;
    if (cron.validate(updateTimeSchedule)) {
        logger.info(`[Cron] Agendando 'updateAllTemposEstacionados' para rodar com schedule: '${updateTimeSchedule}'`);
        cron.schedule(updateTimeSchedule, async () => {
            logger.debug(`[Cron] Executando 'updateAllTemposEstacionados'...`);
            try {
                const affectedRows = await vagaModel.updateAllTemposEstacionados();
                if (affectedRows > 0) {
                    logger.debug(`[Cron] Tempos estacionados no DB atualizados para ${affectedRows} vagas.`);
                }
            } catch(error) {
                logger.error('[Cron] Erro ao executar updateAllTemposEstacionados:', error);
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });
    } else {
        logger.error(`[Cron] Schedule inválido para 'updateAllTemposEstacionados': ${updateTimeSchedule}. Tarefa não agendada.`);
    }

    // --- Tarefa 3: Verificar Reservas PIX Expiradas ---
    const checkPixSchedule = '*/5 * * * *'; // A cada 5 minutos
    if (cron.validate(checkPixSchedule)) {
        logger.info(`[Cron] Agendando 'verificarReservasPixExpiradas' para rodar a cada 5 minutos`);
        cron.schedule(checkPixSchedule, async () => {
            logger.info('[Cron] Executando verificação de reservas PIX expiradas...');
            try {
                // Chama o endpoint da própria API para processar as reservas expiradas
                const apiBaseUrl = process.env.CRON_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                const response = await axios.post(
                    `${apiBaseUrl}/api/cron/verificar-reservas-expiradas`,
                    {},
                    {
                        headers: {
                            'x-api-key': process.env.CRON_API_KEY || 'default-secure-key'
                        },
                        timeout: 15000
                    }
                );

                if (response.data.success) {
                    if (response.data.reservasProcessadas > 0) {
                        logger.info(`[Cron] ${response.data.reservasProcessadas} reservas PIX expiradas foram processadas.`);
                    } else {
                        logger.debug('[Cron] Nenhuma reserva PIX expirada encontrada.');
                    }
                } else {
                    logger.error('[Cron] Erro ao processar reservas PIX expiradas:', response.data.message);
                }
            } catch (error) {
                const status = error.response && error.response.status;
                const dataMsg = error.response && error.response.data && (error.response.data.message || JSON.stringify(error.response.data));
                const errorMessage = dataMsg || (error && error.message) || 'erro-desconhecido';
                logger.error('[Cron] Erro ao verificar reservas PIX expiradas:', { status, message: errorMessage });
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });
    } else {
        logger.error(`[Cron] Schedule inválido para 'verificarReservasPixExpiradas'. Tarefa não agendada.`);
    }

    // --- Tarefa 4: Expirar Reservas Pendentes que Já Passaram do Horário ---
    const expirePendingSchedule = '*/5 * * * *'; // A cada 5 minutos
    if (cron.validate(expirePendingSchedule)) {
        logger.info(`[Cron] Agendando 'expirarReservasPendentes' para rodar a cada 5 minutos`);
        cron.schedule(expirePendingSchedule, async () => {
            logger.info('[Cron] Executando expiração de reservas pendentes...');
            try {
                const apiBaseUrl = process.env.CRON_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
                const response = await axios.post(
                    `${apiBaseUrl}/api/cron/expirar-reservas-pendentes`,
                    {},
                    {
                        headers: {
                            'x-api-key': process.env.CRON_API_KEY || 'default-secure-key'
                        },
                        timeout: 15000
                    }
                );

                if (response.data.success) {
                    if (response.data.reservasProcessadas > 0) {
                        logger.info(`[Cron] ${response.data.reservasProcessadas} reserva(s) pendente(s) expirada(s).`);
                    } else {
                        logger.debug('[Cron] Nenhuma reserva pendente expirada encontrada.');
                    }
                } else {
                    logger.error('[Cron] Erro ao expirar reservas pendentes:', response.data.message);
                }
            } catch (error) {
                const status = error.response && error.response.status;
                const dataMsg = error.response && error.response.data && (error.response.data.message || JSON.stringify(error.response.data));
                const errorMessage = dataMsg || (error && error.message) || 'erro-desconhecido';
                logger.error('[Cron] Erro ao expirar reservas pendentes:', { status, message: errorMessage });
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });
    } else {
        logger.error(`[Cron] Schedule inválido para 'expirarReservasPendentes'. Tarefa não agendada.`);
    }

    logger.info('[Cron] Configuração de tarefas agendadas concluída.');
}

module.exports = initCronJobs;
