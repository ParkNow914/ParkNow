// models/logModel.js
// Funções para interagir com as tabelas de log.

const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger'); // Usa o logger principal

/**
 * Cria log de ação do administrador.
 * @param {number} adminId
 * @param {string} acao
 * @param {string} ipAddress
 * @returns {Promise<number|undefined>} ID do log ou undefined em erro.
 */
const createAdminLog = async (adminId, acao, ipAddress) => {
    const sql = `INSERT INTO logs_admins (admin_id, acao, ip_address) VALUES ($1, $2, $3) RETURNING id`;
    const acaoTruncada = acao ? (acao.length > 250 ? acao.substring(0, 247) + '...' : acao) : 'Ação não especificada';
    const client = await pool.connect();
    
    try {
        const result = await client.query(sql, [adminId, acaoTruncada, ipAddress || 'N/A']);
        logger.info(`[Log Admin ${adminId}] ${acaoTruncada} (IP: ${ipAddress || 'N/A'})`);
        return result.rows[0]?.id;
    } catch (error) {
        logger.error('Erro em createAdminLog:', { 
            adminId, 
            acao: acaoTruncada, 
            ipAddress: ipAddress || 'N/A', 
            error: error.message,
            stack: error.stack
        });
        return undefined;
    } finally {
        client.release();
    }
};

/**
 * Cria log de entrada de veículo.
 * @param {number} estacionamentoId
 * @param {number} vagaId
 * @param {string} placa
 * @param {string|null} tipoVeiculo
 * @param {Date|string} entrada - Timestamp da entrada
 * @param {Object} [connection=pool] - Conexão opcional do banco de dados
 * @returns {Promise<number|undefined>} ID do log ou undefined em erro.
 */
const createVeiculoLogEntrada = async (estacionamentoId, vagaId, placa, tipoVeiculo, entrada, connection = null) => {
    const sql = `
        INSERT INTO logs_veiculos 
        (estacionamento_id, vaga_id, placa_veiculo, tipo_operacao, entrada, data_hora) 
        VALUES ($1, $2, $3, $4, $5, $5) 
        RETURNING id
    `;
    
    const shouldRelease = !connection;
    const client = connection || await pool.connect();
    
    try {
        const entryTs = (entrada instanceof Date) ? entrada : new Date(entrada);
        const result = await client.query(sql, [
            estacionamentoId, 
            vagaId, 
            placa?.toUpperCase() || 'N/A', 
            'entrada', // tipo_operacao deve ser 'entrada'
            entryTs
        ]);
        
        logger.info(`[Log Veículo Entrada] Vaga ${vagaId} (Est. ${estacionamentoId}) Placa: ${placa?.toUpperCase() || 'N/A'}`);
        return result.rows[0]?.id;
    } catch (error) {
        logger.error('Erro em createVeiculoLogEntrada:', { 
            estacionamentoId, 
            vagaId, 
            placa: placa || 'N/A', 
            error: error.message,
            stack: error.stack
        });
        return undefined;
    } finally {
        if (shouldRelease && client) {
            client.release();
        }
    }
};

/**
 * Atualiza log de veículo na saída, buscando pelo ID da vaga.
 * @param {number} vagaId - ID da vaga que foi liberada.
 * @param {number} tempoSegundos - Tempo total calculado.
 * @param {number|null} valorPago - Valor (se aplicável).
 * @returns {Promise<{success: boolean, message?: string}>} Resultado da operação.
 */
const updateVeiculoLogSaidaByVagaId = async (vagaId, tempoSegundos, valorPago = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Encontra o último log de entrada aberto para esta vaga
        const findLogSql = `
            SELECT id 
            FROM logs_veiculos 
            WHERE vaga_id = $1 
            AND saida IS NULL 
            ORDER BY entrada DESC 
            LIMIT 1
        `;
        
        const logResult = await client.query(findLogSql, [vagaId]);
        
        if (logResult.rows.length === 0) {
            logger.warn(`[Log Veículo Saída] Nenhum log aberto encontrado para Vaga ${vagaId}.`);
            return { success: false, message: 'Nenhum registro de entrada encontrado' };
        }
        
        const logId = logResult.rows[0].id;
        const tempoTratado = Number.isInteger(Number(tempoSegundos)) ? Number(tempoSegundos) : 0;
        const valorTratado = (valorPago !== null && !isNaN(parseFloat(valorPago))) ? parseFloat(valorPago) : null;

        const updateLogSql = `
            UPDATE logs_veiculos 
            SET saida = NOW(), 
                tempo_estacionado = $1, 
                valor_pago = $2 
            WHERE id = $3
            RETURNING id
        `;
        
        const updateResult = await client.query(updateLogSql, [
            tempoTratado, 
            valorTratado, 
            logId
        ]);
        
        if (updateResult.rowCount === 0) {
            throw new Error('Falha ao atualizar o log de saída');
        }
        
        await client.query('COMMIT');
        
        logger.info(`[Log Veículo Saída] Vaga ${vagaId} - Log ${logId} atualizado. Tempo: ${tempoTratado}s`);
        return { success: true };
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(`Erro em updateVeiculoLogSaidaByVagaId (Vaga ${vagaId}):`, { 
            error: error.message, 
            stack: error.stack 
        });
        return { 
            success: false, 
            message: `Erro ao registrar saída: ${error.message}` 
        };
    } finally {
        client.release();
    }
};

module.exports = { createAdminLog, createVeiculoLogEntrada, updateVeiculoLogSaidaByVagaId };