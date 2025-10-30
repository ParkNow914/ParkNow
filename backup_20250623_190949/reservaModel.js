// models/reservaModel.js
// Funções para interagir com a tabela 'reservas'.

const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');
const config = require('../config');
const { format, parseISO } = require('date-fns');

// Status de reserva suportados
const RESERVATION_STATUS = {
    PENDING: 'pendente',
    CONFIRMED: 'confirmada',
    ACTIVE: 'ativa',
    COMPLETED: 'concluida',
    CANCELLED: 'cancelada',
    EXPIRED: 'expirada',
    NO_SHOW: 'nao_compareceu'
};

/**
 * Cria uma nova reserva no banco de dados.
 * @param {object} reservaData - Dados da reserva.
 * @param {number} reservaData.usuario_id - ID do usuário
 * @param {number} reservaData.vaga_id - ID da vaga
 * @param {number} reservaData.estacionamento_id - ID do estacionamento
 * @param {string} reservaData.placa_veiculo - Placa do veículo
 * @param {Date|string} reservaData.horario_inicio_reserva - Data/hora de início
 * @param {Date|string} reservaData.horario_fim_reserva - Data/hora de término
 * @param {string} [reservaData.status='confirmada'] - Status inicial da reserva
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<object>} Objeto com ID da reserva
 */
const createReserva = async (reservaData, connection = pool) => {
    const { 
        usuario_id, 
        vaga_id, 
        estacionamento_id, 
        placa_veiculo, 
        horario_inicio_reserva, 
        horario_fim_reserva,
        status = RESERVATION_STATUS.CONFIRMED
    } = reservaData;

    // Validações iniciais
    if (!usuario_id || !vaga_id || !estacionamento_id || !placa_veiculo || 
        !horario_inicio_reserva || !horario_fim_reserva) {
        throw new Error('Dados de reserva incompletos');
    }

    // Formata dados para o banco
    const inicioSql = format(new Date(horario_inicio_reserva), "yyyy-MM-dd HH:mm:ss");
    const fimSql = format(new Date(horario_fim_reserva), "yyyy-MM-dd HH:mm:ss");
    const now = new Date();

    const sql = `
        INSERT INTO reservas (
            usuario_id, 
            vaga_id, 
            estacionamento_id, 
            placa_veiculo, 
            data_reserva, 
            data_entrada_prevista, 
            data_saida_prevista, 
            status, 
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
    `;

    try {
        const result = await connection.query(sql, [
            usuario_id, 
            vaga_id, 
            estacionamento_id, 
            placa_veiculo.toUpperCase(),
            now, // data_reserva
            inicioSql, 
            fimSql,
            status,
            now,
            now
        ]);

        if (!result.rows || !result.rows[0]) {
            throw new Error('Falha ao criar reserva: nenhum dado retornado');
        }

        const reserva = result.rows[0];
        logger.info(`Reserva criada com sucesso`, { 
            reservaId: reserva.id, 
            usuario_id,
            vaga_id,
            status
        });

        return reserva;
    } catch (error) {
        logger.error('Erro ao criar reserva', { 
            error: error.message, 
            stack: error.stack,
            data: {
                ...reservaData,
                horario_inicio_reserva: inicioSql,
                horario_fim_reserva: fimSql
            }
        });
        throw error;
    }
};

/**
 * Busca a reserva ativa (não expirada) para uma vaga específica.
 * @param {number} vagaId
 * @param {object} [connection=pool] - Conexão opcional para transação.
 * @returns {Promise<object|undefined>}
 */
const findActiveReservaByVagaId = async (vagaId, connection = pool) => {
    // Verifica se status é 'ativa' E se o horário final ainda não passou
    const sql = `SELECT * FROM reservas WHERE vaga_id = $1 AND status = 'ativa' AND data_saida_prevista > NOW() LIMIT 1`;
    try {
        const { rows } = await connection.query(sql, [vagaId]);
        return rows[0];
    } catch (error) {
        logger.error(`Erro findActiveReservaByVagaId (Vaga ${vagaId}):`, { error: error.message });
        throw error;
    }
};

/**
 * Busca a reserva ativa (não expirada) de um usuário em um estacionamento específico.
 * Útil para impedir múltiplas reservas ativas no mesmo local.
 * @param {number} usuarioId
 * @param {number} estacionamentoId
 * @param {object} [connection=pool] - Conexão opcional para transação.
 * @returns {Promise<object|undefined>}
 */
const findActiveReservaByUsuarioAndEstacionamento = async (usuarioId, estacionamentoId, connection = pool) => {
    const sql = `SELECT * FROM reservas WHERE usuario_id = $1 AND estacionamento_id = $2 AND status = 'ativa' AND data_saida_prevista > NOW() LIMIT 1`;
     try {
        const { rows } = await connection.query(sql, [usuarioId, estacionamentoId]);
        return rows[0];
    } catch (error) {
        logger.error(`Erro findActiveReservaByUsuarioAndEstacionamento (U:${usuarioId}, E:${estacionamentoId}):`, { error: error.message });
        throw error;
    }
};

/**
 * Busca se existe alguma reserva ativa para um estacionamento específico.
 * Útil para impedir alterações em estacionamentos com reservas ativas.
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {object} [connection=pool] - Conexão opcional para transação.
 * @returns {Promise<object|undefined>} Retorna a primeira reserva ativa encontrada ou undefined
 */
const findActiveReservaByEstacionamento = async (estacionamentoId, connection = pool) => {
    const sql = `
        SELECT * 
        FROM reservas 
        WHERE estacionamento_id = $1 
          AND status = '${RESERVATION_STATUS.ACTIVE}'
          AND data_saida_prevista > NOW() 
        LIMIT 1`;
    try {
        const { rows } = await connection.query(sql, [estacionamentoId]);
        return rows[0];
    } catch (error) {
        logger.error(`Erro ao buscar reserva ativa para estacionamento ${estacionamentoId}:`, { 
            error: error.message,
            stack: error.stack 
        });
        throw error;
    }
};

/**
 * Busca uma reserva pelo seu ID, incluindo nome do estacionamento e número da vaga.
 * @param {number} reservaId
 * @param {object} [connection=pool] - Conexão opcional para transação.
 * @returns {Promise<object|undefined>}
 */
const findReservaById = async (reservaId, connection = pool) => {
    const sql = `
        SELECT 
               r.id,
               r.usuario_id,
               r.vaga_id,
               r.estacionamento_id,
               r.data_reserva,
               r.data_entrada_prevista,
               r.data_saida_prevista,
               r.data_entrada_real,
               r.data_saida_real,
               r.status,
               r.placa_veiculo,
               r.created_at,
               r.updated_at,
               v.numero as numero_vaga,
               e.nome as nome_estacionamento
        FROM reservas r
        LEFT JOIN vagas v ON r.vaga_id = v.id
        LEFT JOIN estacionamentos e ON r.estacionamento_id = e.id
        WHERE r.id = $1
        LIMIT 1
    `;
    
    try {
        const { rows } = await connection.query(sql, [reservaId]);
        
        if (!rows.length) {
            logger.warn(`Nenhuma reserva encontrada para o ID: ${reservaId}`);
            return null;
        }

        const reserva = rows[0];
        
        return reserva;
    } catch (error) {
        logger.error(`Erro ao buscar reserva por ID ${reservaId}:`, { 
            error: error.message, 
            stack: error.stack 
        });
        throw error;
    }
};

// Payment processing functionality has been removed

/**
 * Verifica se uma vaga está disponível para um determinado período.
 * @param {number} vagaId - ID da vaga
 * @param {Date} inicio - Data/hora de início do período desejado
 * @param {Date} fim - Data/hora de término do período desejado
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<boolean>} true se a vaga estiver disponível
 */
const isVagaAvailableForPeriod = async (vagaId, inicio, fim, connection = pool) => {
    // Converte para string no formato SQL
    const inicioSql = format(inicio, "yyyy-MM-dd HH:mm:ss");
    const fimSql = format(fim, "yyyy-MM-dd HH:mm:ss");

    const sql = `
        SELECT id 
        FROM reservas 
        WHERE vaga_id = $1 
          AND status NOT IN ('cancelada', 'rejeitada', 'expirada')
          AND (
              -- Verifica se existe sobreposição de horários
              (data_entrada_prevista < $3 AND data_saida_prevista > $2)
          )
        LIMIT 1
    `;

    try {
        const { rows } = await connection.query(sql, [vagaId, inicioSql, fimSql]);
        // Se não encontrou reservas conflitantes, a vaga está disponível
        return rows.length === 0;
    } catch (error) {
        logger.error('Erro ao verificar disponibilidade da vaga', {
            vagaId,
            inicio: inicioSql,
            fim: fimSql,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

/**
 * Expira reservas não utilizadas que passaram do horário de entrada previsto
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<{expiredCount: number}>} Número de reservas expiradas
 */
const expireUnusedReservas = async (connection = pool) => {
    const sql = `
        UPDATE reservas 
        SET status = $1,
            updated_at = NOW()
        WHERE status = $2 
          AND data_entrada_prevista < NOW() 
          AND data_entrada_real IS NULL
        RETURNING id`;

    try {
        const { rowCount } = await connection.query(sql, [
            RESERVATION_STATUS.EXPIRED,
            RESERVATION_STATUS.PENDING
        ]);

        if (rowCount > 0) {
            logger.info(`Expirou ${rowCount} reservas não utilizadas`);
        }

        return { expiredCount: rowCount };
    } catch (error) {
        logger.error('Erro ao expirar reservas não utilizadas', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
};

/**
 * Busca todas as reservas de um usuário
 * @param {number} usuarioId - ID do usuário
 * @param {object} [options] - Opções de consulta
 * @param {number} [options.limit=50] - Limite de resultados
 * @param {number} [options.offset=0] - Deslocamento para paginação
 * @param {string} [options.orderBy='data_reserva'] - Campo para ordenação
 * @param {string} [options.order='DESC'] - Direção da ordenação (ASC ou DESC)
 * @param {string} [options.status] - Status da reserva
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<Array>} Lista de reservas do usuário
 */
async function findReservasByUsuario(usuarioId, options = {}, connection = pool) {
<<<<<<< Updated upstream
    const { 
        status, 
        limit = 50, 
        offset = 0, 
        orderBy = 'data_reserva', 
        order = 'DESC' 
=======
    console.log('[ReservaModel] Buscando reservas para usuário:', {
        usuarioId,
        options,
        connection: connection ? 'Conexão fornecida' : 'Usando pool padrão'
    });

    const {
        limit = 50,
        offset = 0,
        orderBy = 'data_reserva',
        order = 'DESC'
>>>>>>> Stashed changes
    } = options;

    const validOrderFields = ['data_reserva', 'data_entrada_prevista', 'data_saida_prevista', 'created_at', 'updated_at'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'data_reserva';
    const orderDirection = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    try {
<<<<<<< Updated upstream
        // Log dos parâmetros recebidos
        logger.info('Buscando reservas para usuário', {
            usuarioId,
            options: { limit, offset, orderBy: orderField, order: orderDirection },
            connection: connection !== pool ? 'transaction' : 'pool'
        });

=======
        // Primeiro, verifica se o usuário existe
        const userCheck = await connection.query('SELECT id, email, nome FROM usuarios WHERE id = $1', [usuarioId]);
        if (userCheck.rows.length === 0) {
            console.error(`[ReservaModel] ERRO: Usuário com ID ${usuarioId} não encontrado`);
            return [];
        }

        console.log(`[ReservaModel] Buscando até ${limit} reservas para o usuário ${usuarioId} (${userCheck.rows[0].email})`);
        
>>>>>>> Stashed changes
        const query = `
            SELECT 
                r.id,
                r.usuario_id,
                r.vaga_id,
                r.estacionamento_id,
                r.placa_veiculo,
                r.status,
                r.data_reserva,
                r.data_entrada_prevista,
                r.data_saida_prevista,
                r.horario_entrada,
                r.horario_saida,
                r.valor_total,
                r.created_at,
                r.updated_at,
                e.nome as estacionamento_nome,
                e.endereco as estacionamento_endereco,
                e.telefone as estacionamento_telefone,
                e.email as estacionamento_email,
                v.numero as vaga_numero,
                v.tipo_veiculo as vaga_tipo
            FROM reservas r
            JOIN estacionamentos e ON r.estacionamento_id = e.id
            LEFT JOIN vagas v ON r.vaga_id = v.id
            WHERE r.usuario_id = $1
            ${status ? 'AND r.status = ANY($4::varchar[])' : ''}
            ORDER BY r.${orderField} ${orderDirection}
            LIMIT $2 OFFSET $3
        `;

<<<<<<< Updated upstream
        const params = [usuarioId, limit, offset];
        if (status) {
            // Se for string com vírgulas, converte para array, senão usa como array de um elemento
            const statusArray = typeof status === 'string' && status.includes(',') 
                ? status.split(',').map(s => s.trim())
                : [status];
            params.push(statusArray);
        }
        
        logger.debug('Executando consulta SQL:', { query, params });
        const result = await connection.query(query, params);
        
        // Log do resultado da consulta
        logger.info('Resultado da busca de reservas', {
            usuarioId,
            rowCount: result.rowCount,
            reservas: result.rows.map(r => ({
                id: r.id, 
                status: r.status,
                data_reserva: r.data_reserva,
                data_entrada_prevista: r.data_entrada_prevista,
                data_saida_prevista: r.data_saida_prevista,
                estacionamento: r.estacionamento_nome,
                vaga_numero: r.vaga_numero
            }))
        });
=======
        console.log('[ReservaModel] Executando query:', {
            query: query
                .replace(/\s+/g, ' ')
                .replace(/\$1/g, usuarioId)
                .replace(/\$2/g, limit)
                .replace(/\$3/g, offset)
                .replace(/\$\{orderField\}/g, orderField)
                .replace(/\$\{orderDirection\}/g, orderDirection),
            params: [usuarioId, limit, offset]
        });

        const startTime = Date.now();
        const result = await connection.query(query, [usuarioId, limit, offset]);
        const duration = Date.now() - startTime;
        
        console.log(`[ReservaModel] Query executada em ${duration}ms. ${result.rows.length} reservas encontradas.`);
        
        if (result.rows.length > 0) {
            console.log('[ReservaModel] Exemplo de reserva retornada:', {
                id: result.rows[0].id,
                status: result.rows[0].status,
                data_entrada_prevista: result.rows[0].data_entrada_prevista,
                data_saida_prevista: result.rows[0].data_saida_prevista,
                estacionamento: result.rows[0].estacionamento_nome,
                vaga: result.rows[0].vaga_numero
            });
        } else {
            console.log('[ReservaModel] Nenhuma reserva encontrada para o usuário');
            
            // Verifica se existem reservas para outros usuários
            const otherReservasCheck = await connection.query('SELECT COUNT(*) as total FROM reservas LIMIT 1');
            console.log(`[ReservaModel] Total de reservas no sistema: ${parseInt(otherReservasCheck.rows[0]?.total) || 0}`);
        }
>>>>>>> Stashed changes
        
        return result.rows;
    } catch (error) {
        console.error('[ReservaModel] ERRO ao buscar reservas:', {
            error: error.message,
            stack: error.stack,
            usuarioId,
            options
        });
        
        // Log adicional para erros de banco de dados
        if (error.code) {
            console.error('[ReservaModel] Detalhes do erro de banco de dados:', {
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position,
                internalPosition: error.internalPosition,
                internalQuery: error.internalQuery,
                where: error.where,
                schema: error.schema,
                table: error.table,
                column: error.column,
                dataType: error.dataType,
                constraint: error.constraint
            });
        }
        
        throw new Error('Erro ao buscar reservas do usuário');
    }
}

/**
 * Conta o número total de reservas de um usuário
 * @param {number} usuarioId - ID do usuário
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<number>} Número total de reservas do usuário
 */
async function countReservasByUsuario(usuarioId, connection = pool) {
    console.log(`[ReservaModel] Contando reservas para o usuário ${usuarioId}`);
    
    try {
        // Verifica se o usuário existe
        const userCheck = await connection.query('SELECT id, email FROM usuarios WHERE id = $1', [usuarioId]);
        if (userCheck.rows.length === 0) {
            console.error(`[ReservaModel] ERRO: Usuário com ID ${usuarioId} não encontrado para contagem`);
            return 0;
        }
        
        const query = 'SELECT COUNT(*) as total FROM reservas WHERE usuario_id = $1';
        console.log(`[ReservaModel] Executando contagem: ${query.replace('$1', usuarioId)}`);
        
        const startTime = Date.now();
        const result = await connection.query(query, [usuarioId]);
        const duration = Date.now() - startTime;
        
        const total = parseInt(result.rows[0]?.total || 0, 10);
        console.log(`[ReservaModel] Contagem concluída em ${duration}ms. Total de reservas: ${total}`);
        
        return total;
    } catch (error) {
        console.error(`[ReservaModel] ERRO ao contar reservas para o usuário ${usuarioId}:`, {
            error: {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint
            },
            stack: error.stack
        });
        
        // Log adicional para erros de banco de dados
        if (error.code) {
            console.error('[ReservaModel] Detalhes do erro de banco de dados:', {
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position,
                internalPosition: error.internalPosition,
                internalQuery: error.internalQuery,
                where: error.where,
                schema: error.schema,
                table: error.table,
                column: error.column,
                dataType: error.dataType,
                constraint: error.constraint
            });
        }
        
        throw new Error('Erro ao contar reservas do usuário');
    }
}

/**
 * Atualiza o status de uma reserva
 * @param {number} reservaId - ID da reserva
 * @param {string} novoStatus - Novo status da reserva
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<boolean>} true se a atualização for bem-sucedida
 */
async function atualizarStatus(reservaId, novoStatus, connection = pool) {
    try {
        if (!Object.values(RESERVATION_STATUS).includes(novoStatus)) {
            throw new Error(`Status de reserva inválido: ${novoStatus}`);
        }
        
        const query = `
            UPDATE reservas 
            SET status = $1, 
                updated_at = NOW()
            WHERE id = $2
            RETURNING id
        `;
        
        const { rowCount } = await connection.query(query, [novoStatus, reservaId]);
        
        if (rowCount > 0) {
            logger.info(`Status da reserva ${reservaId} atualizado para: ${novoStatus}`);
            return true;
        }
        
        return false;
    } catch (error) {
        logger.error('Erro ao atualizar status da reserva:', {
            error: error.message,
            reservaId,
            novoStatus,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Busca uma reserva pelo TXID do pagamento
 * @param {string} txid - TXID do pagamento
 * @param {object} [connection=pool] - Conexão opcional para transação
 * @returns {Promise<object|undefined>} Reserva encontrada ou undefined
 */
async function findByTxid(txid, connection = pool) {
    try {
        const query = `
            SELECT r.* 
            FROM reservas r
            JOIN pagamentos p ON r.id = p.reserva_id
            WHERE p.dados_adicionais->>'txid' = $1
            LIMIT 1
        `;
        
        const { rows } = await connection.query(query, [txid]);
        return rows[0];
    } catch (error) {
        logger.error('Erro ao buscar reserva por TXID:', {
            error: error.message,
            txid,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Calcula o valor total de uma reserva com base no tempo e preço por hora
 * @param {Date} inicio - Data/hora de início da reserva
 * @param {Date} fim - Data/hora de término da reserva
 * @param {number} precoHora - Preço por hora do estacionamento
 * @returns {number} Valor total calculado
 */
function calcularValorReserva(inicio, fim, precoHora) {
    const diffMs = new Date(fim) - new Date(inicio);
    const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60)); // Arredonda para cima
    return parseFloat((diffHoras * precoHora).toFixed(2));
}

// Exporta todos os métodos do modelo
module.exports = {
    // Constantes
    RESERVATION_STATUS,
    
    // Métodos principais
    createReserva,
    atualizarStatus,
    
    // Métodos de busca
    findActiveReservaByVagaId,
    findActiveReservaByUsuarioAndEstacionamento,
    findActiveReservaByEstacionamento,
    findReservaById,
    findReservasByUsuario,
    countReservasByUsuario,
    findByTxid,
    
    // Métodos de verificação e cálculo
    isVagaAvailableForPeriod,
    expireUnusedReservas,
    calcularValorReserva
};