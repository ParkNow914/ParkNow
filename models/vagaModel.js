// models/vagaModel.js
// Contém as funções para interagir com a tabela 'vagas'.

const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');
const reservaModel = require('./reservaModel'); // Importa para interagir com reservas
const logModel = require('./logModel'); // Importa para logs de veículo
const config = require('../config'); // Para config.reserva.bufferOcupadaHoras
const dateUtils = require('../utils/dateUtils'); // Utilitário para manipulação de datas

// --- Funções de Busca ---
/** Busca todas as vagas com detalhes para admin (com filtro opcional) */
const findAllVagasAdmin = async (estacionamentoId = null) => {
    try {
        let sql = `
            SELECT v.id, v.numero, v.status, v.placa, v.tipo_veiculo, v.entrada, v.tempo_estacionado, v.usuario_id, v.reserva_id_ativa,
                   e.nome as estacionamento_nome, v.estacionamento_id, u.nome as usuario_nome, res.data_saida_prevista as horario_fim_reserva
            FROM vagas v
            JOIN estacionamentos e ON v.estacionamento_id = e.id
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            LEFT JOIN reservas res ON v.reserva_id_ativa = res.id AND res.status = 'confirmada'
        `;
        const params = [];
        if (estacionamentoId) { 
            sql += ' WHERE v.estacionamento_id = $1'; 
            params.push(estacionamentoId); 
        }
        sql += ' ORDER BY v.estacionamento_id, v.numero';
        const { rows } = await pool.query(sql, params);
        return rows;
    } catch (error) { 
        logger.error('Erro em findAllVagasAdmin:', error); 
        throw error; 
    }
};

/** Busca vagas de um estacionamento para visão do cliente */
const findByEstacionamentoId = async (estacionamentoId) => {
    try {
        const sql = `
            SELECT 
                id, numero, status, entrada, 
                tempo_estacionado, placa, 
                reserva_id_ativa, tipo_veiculo
            FROM vagas 
            WHERE estacionamento_id = $1 
            ORDER BY numero ASC
        `;
        const { rows } = await pool.query(sql, [estacionamentoId]);
        return rows;
    } catch (error) { 
        logger.error(`Erro ao buscar vagas para estacionamento ${estacionamentoId}:`, error);
        throw new Error('Erro ao buscar vagas do estacionamento');
    }
};

/** Busca vaga por ID (completa) */
const findById = async (id) => {
    try { 
        const sql = `
            SELECT 
                id, numero, status, tipo_veiculo, 
                entrada, placa, usuario_id, estacionamento_id,
                tempo_estacionado, reserva_id_ativa
            FROM vagas 
            WHERE id = $1 
            LIMIT 1
        `; 
        const { rows } = await pool.query(sql, [id]); 
        return rows[0]; 
    } catch (error) { 
        logger.error(`Erro findById(V:${id}):`, error); 
        throw error; 
    }
};

/** Busca vaga para ocupação, verifica status e reserva */
const findByIdForOcupacao = async (id, connection = pool) => { // Aceita connection
    try { const sql = 'SELECT id, status, reserva_id_ativa, estacionamento_id, numero FROM vagas WHERE id = $1 LIMIT 1'; const { rows } = await connection.query(sql, [id]); return rows[0]; }
    catch (error) { logger.error(`Erro findByIdForOcupacao(V:${id}):`, error); throw error; }
};

/** Busca vaga por número e estacionamento */
const findByNumeroAndEstacionamento = async (num, estId) => { 
    try { 
        const sql = `
            SELECT 
                id, numero, status, tipo_veiculo, 
                entrada, placa, usuario_id, estacionamento_id,
                tempo_estacionado, reserva_id_ativa
            FROM vagas 
            WHERE numero = $1 AND estacionamento_id = $2 
            LIMIT 1
        `; 
        const { rows } = await pool.query(sql, [num, estId]); 
        return rows[0]; 
    } catch (e) { 
        logger.error(`Erro findByNumEst(N:${num},E:${estId}):`, e); 
        throw e; 
    } 
};

/** Busca vagas ocupadas (com filtro opcional) */
const findOcupadas = async (estId = null) => { 
    try { 
        let sql = `
            SELECT v.id, v.numero, v.placa, v.tipo_veiculo, v.entrada, v.tempo_estacionado, 
                   v.usuario_id, e.nome as estacionamento_nome, u.nome as usuario_nome
            FROM vagas v
            JOIN estacionamentos e ON v.estacionamento_id = e.id
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            WHERE v.status = 'ocupada'
        `;
        const params = [];
        
        if (estId) {
            sql += " AND v.estacionamento_id = $1";
            params.push(estId);
        }
        
        sql += " ORDER BY v.estacionamento_id, v.numero";
        const { rows } = await pool.query(sql, params);
        return rows;
    } catch (e) { 
        logger.error(`Erro findOcupadas(E:${estId}):`, e); 
        throw e; 
    } 
};

/** Conta vagas livres (com filtro opcional) */
const countLivres = async (estId = null) => { 
    try { 
        let sql = "SELECT COUNT(*) as total FROM vagas WHERE status = 'livre'"; 
        const params = [];
        
        if (estId) {
            sql += " AND estacionamento_id = $1";
            params.push(estId);
        }
        
        const { rows } = await pool.query(sql, params);
        return rows[0].total;
    } catch (e) { 
        logger.error(`Erro countLivres(E:${estId}):`, e); 
        throw e; 
    } 
};

/** Busca tempo_estacionado salvo no DB */
const findTempoDbById = async (id) => { 
    try { 
        const sql = 'SELECT tempo_estacionado FROM vagas WHERE id = $1 LIMIT 1'; 
        const { rows } = await pool.query(sql, [id]); 
        return rows[0]?.tempo_estacionado || null; 
    } catch (e) { 
        logger.error(`Erro findTempoDbById(V:${id}):`, e); 
        throw e; 
    } 
};

/** Busca status e entrada para cálculo de tempo, incluindo informações do usuário */
const findTempoEntradaById = async (id) => { 
    try { 
        const sql = `
            SELECT v.id, v.status, v.entrada, v.estacionamento_id, v.usuario_id, v.placa, 
                   e.nome as estacionamento_nome, u.nome as usuario_nome
            FROM vagas v
            LEFT JOIN estacionamentos e ON v.estacionamento_id = e.id
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            WHERE v.id = $1 LIMIT 1
        `; 
        const { rows } = await pool.query(sql, [id]); 
        return rows[0]; 
    } catch (e) { 
        logger.error(`Erro findTempoEntradaById(V:${id}):`, e); 
        throw e; 
    } 
};

// --- Funções de Atualização ---
/** 
 * Marca vaga como reservada 
 * @param {number} vagaId - ID da vaga
 * @param {number} reservaId - ID da reserva
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<boolean>} true se a vaga foi reservada com sucesso
 */
const reservarVaga = async (vagaId, reservaId, connection = pool) => {
    // Garante que temos um número válido para o ID da reserva
    const reservaIdNum = typeof reservaId === 'object' ? reservaId.id : reservaId;
    
    if (!reservaIdNum) {
        throw new Error('ID da reserva inválido');
    }
    
    const sql = `UPDATE vagas SET status = 'reservada', reserva_id_ativa = $1 WHERE id = $2 AND status = 'livre'`;
    
    try { 
        const { rowCount } = await connection.query(sql, [reservaIdNum, vagaId]); 
        logger.info(`Vaga ${vagaId} marcada como reservada para Reserva ${reservaIdNum}`); 
        return rowCount > 0; 
    } catch (e) { 
        logger.error(`Erro reservarVaga(V:${vagaId}, R:${reservaId}):`, e); 
        throw e; 
    }
};

/** Ocupa vaga (usuário), verifica reserva, faz checkin, loga */
const ocuparVaga = async (vagaId, userId, placaVeiculo) => {
    // Performance: Usar uma única conexão para todas as operações
    const client = await pool.connect();
    
    try {
        // Iniciar transação para garantir atomicidade
        await client.query('BEGIN');
        
        // Buscar informações da vaga com query otimizada
        const vagaAtual = await findByIdForOcupacao(vagaId, client);
        if (!vagaAtual) throw new Error("Vaga não encontrada.");

        // Verificar status da vaga
        let reservaParaCheckin = null;
        if (vagaAtual.status === 'reservada') {
            // Verificar reserva apenas se a vaga estiver reservada
            if (!vagaAtual.reserva_id_ativa) throw new Error("Vaga reservada sem ID.");
            
            // Buscar informações da reserva
            reservaParaCheckin = await reservaModel.findReservaById(vagaAtual.reserva_id_ativa, client);
            
            // Verificar se a reserva é válida para este usuário
            if (!reservaParaCheckin || reservaParaCheckin.usuario_id !== userId || reservaParaCheckin.status_reserva !== 'ativa') {
                throw new Error("Vaga reservada por outro ou reserva inativa.");
            }
            
            // Verificar se a reserva não expirou
            const agora = new Date();
            const fimReserva = new Date(reservaParaCheckin.data_saida_prevista);
            
            if (agora > fimReserva) {
                // Atualizar status da reserva e liberar a vaga
                await reservaModel.updateReservaStatus(reservaParaCheckin.id, 'nao_compareceu', client);
                await client.query('UPDATE vagas SET status=$1, reserva_id_ativa=NULL WHERE id = $2', ['livre', vagaId]);
                await client.query('COMMIT');
                throw new Error("Período da reserva expirou.");
            }
        } else if (vagaAtual.status !== 'livre') {
            throw new Error("Vaga não está livre.");
        }

        // Preparar dados para atualização usando o utilitário de datas
        // Obter o timestamp atual em UTC para garantir consistência
        const horaEntrada = dateUtils.nowUTC();
        // Manter o formato UTC completo com 'Z' para garantir que o cliente interprete corretamente
        const entradaSql = dateUtils.formatForAPI(horaEntrada);
        
        // Atualizar status da vaga para ocupada
        const sqlUpdVaga = `UPDATE vagas SET status='ocupada', placa=$1, entrada=$2, tempo_estacionado=0, usuario_id=$3, reserva_id_ativa=NULL 
                           WHERE id=$4 AND (status='livre' OR (status='reservada' AND reserva_id_ativa=$5))`;
        
        const { rowCount } = await client.query(sqlUpdVaga, [
            placaVeiculo.toUpperCase(),
            entradaSql,
            userId,
            vagaId,
            reservaParaCheckin?.id || null
        ]);
        
        if (rowCount === 0) {
            throw new Error("Não ocupou (concorrência?).");
        }

        // Registrar check-in se houver reserva
        if (reservaParaCheckin) {
            await reservaModel.registrarCheckin(reservaParaCheckin.id, horaEntrada, client);
        }
        
        // Criar log de entrada do veículo (pode ser feito de forma assíncrona)
        // Performance: Usar a mesma conexão para o log
        await logModel.createVeiculoLogEntrada(
            vagaAtual.estacionamento_id,
            vagaId,
            placaVeiculo.toUpperCase(),
            null,
            horaEntrada,
            client // Passar a mesma conexão
        );

        // Commit da transação
        await client.query('COMMIT');
        logger.info(`Vaga ${vagaId} ocupada por User ${userId}.`);
        return true;
    } catch (error) {
        // Rollback em caso de erro
        await client.query('ROLLBACK');
        logger.error(`Erro ocuparVaga(V:${vagaId}, U:${userId}):`, error);
        throw error;
    } finally {
        // Liberar a conexão
        client.release();
    }
};

/** Ocupa vaga (admin), loga */
const ocuparVagaAdmin = async (vagaId, placa, tipoVeiculo, estacionamentoId) => {
    const sql = `UPDATE vagas SET status='ocupada', placa=$1, tipo_veiculo=$2, entrada=NOW(), tempo_estacionado=0, usuario_id=NULL, reserva_id_ativa=NULL WHERE id=$3 AND status='livre'`;
    try {
        const horaEntrada = new Date();
        const result = await pool.query(sql, [placa.toUpperCase(), tipoVeiculo, vagaId]);
        if (result.rowCount > 0) {
            await logModel.createVeiculoLogEntrada(estacionamentoId, vagaId, placa.toUpperCase(), tipoVeiculo, horaEntrada);
            logger.info(`Vaga ${vagaId} ocupada por Admin.`);
            return true;
        }
        logger.warn(`[Admin Ocupar] Vaga ${vagaId} não estava livre.`); 
        return false;
    } catch (e) { 
        logger.error(`Erro ocuparVagaAdmin(V:${vagaId}):`, e); 
        throw e; 
    }
};

/** Libera vaga (admin), loga, atualiza log veículo */
const liberarVagaAdmin = async (vagaId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // FOR UPDATE para bloquear a linha durante a transação
        const { rows: vagaRows } = await client.query('SELECT * FROM vagas WHERE id = $1 AND status = $2 FOR UPDATE', [vagaId, 'ocupada']);
        if (vagaRows.length === 0) throw new Error("Vaga não encontrada ou não está ocupada.");
        const vagaInfo = vagaRows[0];

        const sql = `UPDATE vagas SET status='livre', placa=NULL, tipo_veiculo=NULL, entrada=NULL, tempo_estacionado=0, usuario_id=NULL, reserva_id_ativa=NULL WHERE id=$1`;
        const result = await client.query(sql, [vagaId]);

        if (result.rowCount > 0) {
            let tempoSegundos = vagaInfo.tempo_estacionado || 0;
            if (vagaInfo.entrada) { 
                const e = new Date(vagaInfo.entrada).getTime(); 
                const s = Date.now(); 
                tempoSegundos = Math.max(0, Math.floor((s - e) / 1000)); 
            }
            
            const logResult = await logModel.updateVeiculoLogSaidaByVagaId(vagaId, tempoSegundos, null);
            if (!logResult.success) {
                throw new Error(`Falha ao atualizar log de veículo: ${logResult.message || 'Erro desconhecido'}`);
            }
            
            await client.query('COMMIT');
            logger.info(`Vaga ${vagaId} liberada por Admin.`);
            return { success: true, vagaInfo: vagaInfo };
        } else {
            // Se não afetou linhas, mas passou na verificação inicial, algo está errado.
            throw new Error("Não foi possível liberar a vaga (estado inconsistente?).");
        }
    } catch (error) { 
        await client.query('ROLLBACK'); 
        logger.error(`Erro liberarVagaAdmin(V:${vagaId}):`, error); 
        throw error; 
    } finally { 
        client.release(); 
    }
};

/** Libera vaga (usuário), verifica se ele é o ocupante, loga, atualiza log veículo */
const liberarVagaUsuario = async (vagaId, userId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // FOR UPDATE para bloquear a linha durante a transação
        const { rows: vagaRows } = await client.query(
            'SELECT * FROM vagas WHERE id = $1 AND status = $2 AND usuario_id = $3 FOR UPDATE', 
            [vagaId, 'ocupada', userId]
        );
        if (vagaRows.length === 0) throw new Error("Vaga não encontrada, não está ocupada ou não pertence ao usuário.");
        const vagaInfo = vagaRows[0];

        // Calcular o tempo estacionado
        let tempoSegundos = vagaInfo.tempo_estacionado || 0;
        if (vagaInfo.entrada) { 
            const e = new Date(vagaInfo.entrada).getTime(); 
            const s = Date.now(); 
            tempoSegundos = Math.max(0, Math.floor((s - e) / 1000)); 
        }

        // Atualizar o log de veículo antes de liberar a vaga
        try {
            // Encontra o último log de entrada aberto para esta vaga
            const { rows: logRows } = await client.query(
                'SELECT id FROM logs_veiculos WHERE vaga_id = $1 AND saida IS NULL ORDER BY entrada DESC LIMIT 1', 
                [vagaId]
            );
            
            if (logRows.length > 0) {
                const logId = logRows[0].id;
                // Atualizar o log com a saída e o tempo estacionado
                await client.query(
                    'UPDATE logs_veiculos SET saida = NOW(), tempo_estacionado = $1 WHERE id = $2', 
                    [tempoSegundos, logId]
                );
                logger.info(`[Log Veículo Saída] Vaga ${vagaId} - Log ${logId} atualizado. Tempo: ${tempoSegundos}s`);
            } else {
                logger.warn(`[Log Veículo Saída] Log aberto não encontrado para Vaga ${vagaId}.`);
                // Continuar mesmo sem log (não bloquear a liberação da vaga)
            }
        } catch (logError) {
            logger.error(`Erro ao atualizar log de veículo para Vaga ${vagaId}:`, logError);
            // Continuar mesmo com erro no log (não bloquear a liberação da vaga)
        }

        // Liberar a vaga no banco de dados
        const sql = `UPDATE vagas SET status='livre', placa=NULL, tipo_veiculo=NULL, entrada=NULL, tempo_estacionado=0, usuario_id=NULL, reserva_id_ativa=NULL WHERE id=$1`;
        const result = await client.query(sql, [vagaId]);

        if (result.rowCount > 0) {
            await client.query('COMMIT');
            logger.info(`Vaga ${vagaId} liberada pelo usuário ${userId}.`);
            return { 
                success: true, 
                vagaInfo: vagaInfo,
                tempoEstacionado: tempoSegundos,
                tempoFormatado: formatarTempoSegundos(tempoSegundos)
            };
        } else {
            throw new Error("Não foi possível liberar a vaga (estado inconsistente?).");
        }
    } catch (error) { 
        await client.query('ROLLBACK'); 
        logger.error(`Erro liberarVagaUsuario(V:${vagaId}, U:${userId}):`, error); 
        throw error; 
    } finally { 
        client.release(); 
    }
};

// Função auxiliar para formatar tempo em segundos para HH:MM:SS
const formatarTempoSegundos = (segundos) => {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
};

/** Atualiza todos os tempos estacionados no banco de dados */
const updateAllTemposEstacionados = async () => {
    try {
        // Usar NOW() para garantir consistência de fuso horário
        // Isso é crucial para evitar cálculos negativos de tempo
        const sql = `
            UPDATE vagas 
            SET tempo_estacionado = GREATEST(0, EXTRACT(EPOCH FROM (NOW() - entrada))::integer)
            WHERE status = 'ocupada' AND entrada IS NOT NULL
            RETURNING id, estacionamento_id, numero, status, entrada, tempo_estacionado, usuario_id
        `;
        const result = await pool.query(sql);
        
        // Após atualizar os tempos, buscar todas as vagas ocupadas para emitir via Socket.IO
        if (result.rowCount > 0) {
            try {
                const socketService = require('../services/socketService');
                const { rows: vagas } = await pool.query(`
                    SELECT v.id, v.estacionamento_id, v.numero, v.status, v.entrada, 
                           v.tempo_estacionado, v.usuario_id, e.nome as estacionamento_nome
                    FROM vagas v
                    JOIN estacionamentos e ON v.estacionamento_id = e.id
                    WHERE v.status = 'ocupada' AND v.entrada IS NOT NULL
                `);
                
                // Para cada vaga ocupada, emitir atualização para a sala do estacionamento
                vagas.forEach(vaga => {
                    // Corrigir o timestamp de entrada se necessário
                    let entradaCorrigida = vaga.entrada;
                    
                    // Verificar se o timestamp está em um formato válido
                    if (entradaCorrigida) {
                        try {
                            // Garantir que o timestamp esteja em formato UTC válido
                            entradaCorrigida = dateUtils.formatForAPI(entradaCorrigida);
                        } catch (err) {
                            logger.error(`Erro ao formatar timestamp de entrada para vaga ${vaga.id}:`, err);
                        }
                    }
                    
                    // Emitir para a sala do estacionamento
                    socketService.emitVagaAtualizada(vaga.estacionamento_id, vaga.id, {
                        status: vaga.status,
                        entrada: entradaCorrigida,
                        tempo_estacionado: vaga.tempo_estacionado,
                        segundos: vaga.tempo_estacionado,
                        // Adicionar informações de fuso horário para o cliente
                        timezone: {
                            serverTimezone: config.timezone.default,
                            offsetHours: config.timezone.offsetHours,
                            serverTime: dateUtils.formatForAPI(dateUtils.nowUTC())
                        }
                    });
                });
            } catch (socketError) {
                logger.error('Erro ao emitir atualizações de tempo via Socket.IO:', socketError);
                // Não propagar o erro para não interromper a operação principal
            }
        }
        
        return result.affectedRows;
    } catch (error) { logger.error('Erro updateAllTemposEstacionados:', error); throw error; }
};

// --- Gerenciamento (Admin) ---
/** Ajusta número de vagas */
const adjustVagasCount = async (estId, novoNum) => {
    const client = await pool.connect();
    let added = 0; 
    let removed = 0;
    
    try {
        await client.query('BEGIN');
        
        // Get current count of parking spots
        const countResult = await client.query(
            'SELECT COUNT(*) as "currentCount" FROM vagas WHERE estacionamento_id = $1', 
            [estId]
        );
        const currentCount = parseInt(countResult.rows[0].currentCount, 10);
        
        // Get maximum spot number
        const maxNumResult = await client.query(
            'SELECT COALESCE(MAX(numero), 0) as "maxNum" FROM vagas WHERE estacionamento_id = $1', 
            [estId]
        );
        const maxNum = parseInt(maxNumResult.rows[0].maxNum, 10) || 0;

        if (novoNum > currentCount) {
            // Add new parking spots
            const vagasToAdd = novoNum - currentCount;
            const sqlInsert = "INSERT INTO vagas (numero, estacionamento_id, status) VALUES ($1, $2, 'livre')";
            for (let i = 1; i <= vagasToAdd; i++) { 
                await client.query(sqlInsert, [maxNum + i, estId]); 
                added++; 
            }
        } else if (novoNum < currentCount) {
            // Remove parking spots (only free ones)
            const vagasToRemove = currentCount - novoNum;
            const sqlDelete = `
                WITH deletable AS (
                    SELECT id FROM vagas 
                    WHERE estacionamento_id = $1 AND status = 'livre' 
                    ORDER BY numero DESC 
                    LIMIT $2
                    FOR UPDATE
                )
                DELETE FROM vagas WHERE id IN (SELECT id FROM deletable)
            `;
            
            const result = await client.query(sqlDelete, [estId, vagasToRemove]);
            if (result.rowCount < vagasToRemove) {
                throw new Error(`Apenas ${result.rowCount} vagas livres puderam ser removidas de ${vagasToRemove} solicitadas.`);
            }
            removed = result.rowCount;
        }
        
        await client.query('COMMIT');
        return { success: true, added, removed };
        
    } catch (error) { 
        await client.query('ROLLBACK'); 
        logger.error(`Erro adjustVagasCount(E:${estId}):`, error);
        return { success: false, message: error.message };
    } finally { 
        client.release();
    }
};

/** Cria vagas iniciais */
const createInitialVagas = async (estId, numVagas, client) => {
    if (numVagas <= 0) return;
    
    try {
        // Iniciar transação para melhor performance
        await client.query('BEGIN');
        
        // Usar um loop para inserir cada vaga individualmente
        // Incluindo campos obrigatórios adicionais
        const sqlInsert = `
            INSERT INTO vagas (
                numero, 
                estacionamento_id, 
                status, 
                tipo_veiculo, 
                entrada, 
                tempo_estacionado, 
                usuario_id, 
                reserva_id_ativa, 
                placa,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        `;
        
        // Valores padrão para os campos adicionais
        const tipoVeiculo = 'carro';
        const entrada = null;
        const tempoEstacionado = 0;
        const usuarioId = null;
        const reservaIdAtiva = null;
        const placa = null;
        
        for (let i = 1; i <= numVagas; i++) {
            await client.query(sqlInsert, [
                i, 
                estId, 
                'livre', 
                tipoVeiculo, 
                entrada, 
                tempoEstacionado, 
                usuarioId, 
                reservaIdAtiva, 
                placa
            ]);
        }
        
        await client.query('COMMIT');
        logger.info(`${numVagas} vagas iniciais criadas E:${estId}.`);
    } catch (error) { 
        await client.query('ROLLBACK');
        logger.error(`Erro criar vagas iniciais E:${estId}:`, error); 
        throw error; 
    }
};

module.exports = { findAllVagasAdmin, findByEstacionamentoId, findById, findByIdForOcupacao, findByNumeroAndEstacionamento, findOcupadas, countLivres, findTempoDbById, findTempoEntradaById, reservarVaga, ocuparVaga, ocuparVagaAdmin, liberarVagaAdmin, liberarVagaUsuario, updateAllTemposEstacionados, adjustVagasCount, createInitialVagas };