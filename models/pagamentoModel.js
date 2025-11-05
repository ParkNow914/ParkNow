// models/pagamentoModel.js
// Modelo para gerenciar pagamentos no sistema

const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../config/constants');

// Status de pagamento suportados (mantido para compatibilidade)
const PAGAMENTO_STATUS = PAYMENT_STATUS;

// Tipos de pagamento suportados (mantido para compatibilidade)
const TIPO_PAGAMENTO = PAYMENT_METHODS;

// TTL para cache de consultas (em segundos)
const CACHE_TTL = 300; // 5 minutos

/**
 * Cria um novo registro de pagamento
 * @param {Object} pagamentoData - Dados do pagamento
 * @param {number} pagamentoData.reserva_id - ID da reserva
 * @param {string} pagamentoData.metodo - Método de pagamento (ex: 'pix', 'cartao')
 * @param {number} pagamentoData.valor - Valor do pagamento
 * @param {string} pagamentoData.status - Status do pagamento
 * @param {Object} [dadosAdicionais] - Dados adicionais do pagamento (opcional)
 * @param {Object} [client] - Cliente de transação opcional
 * @returns {Promise<number>} ID do pagamento criado
 */
const criarPagamento = async (pagamentoData, dadosAdicionais = {}, client = null) => {
    const { reserva_id, metodo, valor, status } = pagamentoData;
    const { id_estacionamento, id_usuario } = pagamentoData;

    logger.info('Criando pagamento no banco de dados:', {
        reserva_id,
        metodo,
        valor,
        status,
        id_estacionamento,
        id_usuario,
        hasIdEstacionamento: !!id_estacionamento,
        hasUserId: !!id_usuario
    });

    if (!reserva_id) {
        throw new Error('ID da reserva é obrigatório para criar um pagamento');
    }

    const query = `
        INSERT INTO pagamentos
        (reserva_id, metodo_pagamento, valor, status, dados_retorno, id_estacionamento, id_usuario, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id
    `;

    const params = [
        reserva_id,
        metodo,
        valor,
        status,
        JSON.stringify({
            ...dadosAdicionais,
            reserva_id,
            metodo_pagamento: metodo,
            valor_pagamento: valor,
            status_pagamento: status,
            data_criacao: new Date().toISOString()
        }),
        id_estacionamento || null,
        id_usuario || null
    ];

    try {
        let result;
        if (client) {
            // Usa o cliente de transação fornecido
            result = await client.query(query, params);
        } else {
            // Usa o pool diretamente (para compatibilidade)
            result = await pool.query(query, params);
        }

        if (!result.rows || result.rows.length === 0) {
            throw new Error('Falha ao criar pagamento: nenhum ID retornado');
        }

        const pagamentoId = result.rows[0].id;
        logger.info(`Pagamento criado com sucesso. ID: ${pagamentoId}, Reserva: ${reserva_id}`);
        return pagamentoId;
    } catch (error) {
        logger.error('Erro ao criar pagamento:', error);
        throw error;
    }
};

/**
 * Atualiza o status de um pagamento
 * @param {number} pagamentoId - ID do pagamento
 * @param {string} novoStatus - Novo status do pagamento
 * @param {Object} [dadosAdicionais] - Dados adicionais para atualização (opcional)
 * @returns {Promise<boolean>} Verdadeiro se atualizado com sucesso
 */
const atualizarStatusPagamento = async (pagamentoId, novoStatus, dadosAdicionais = null) => {
    const query = `
        UPDATE pagamentos
        SET status = $1,
            updated_at = NOW()
            ${dadosAdicionais ? ', dados_retorno = dados_retorno || $3::jsonb' : ''}
        WHERE id = $2
        RETURNING id
    `;

    try {
        const params = [novoStatus, pagamentoId];
        if (dadosAdicionais) params.push(JSON.stringify(dadosAdicionais));

        const { rowCount } = await pool.query(query, params);

        if (rowCount > 0) {
            logger.info(`Status do pagamento ${pagamentoId} atualizado para: ${novoStatus}`);
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Erro ao atualizar status do pagamento:', error);
        throw error;
    }
};

/**
 * Busca um pagamento pelo ID
 * @param {number} pagamentoId - ID do pagamento
 * @returns {Promise<Object|null>} Dados do pagamento ou null se não encontrado
 */
const buscarPagamentoPorId = async (pagamentoId) => {
    const query = 'SELECT * FROM pagamentos WHERE id = $1';

    try {
        const { rows } = await pool.query(query, [pagamentoId]);
        return rows[0] || null;
    } catch (error) {
        logger.error('Erro ao buscar pagamento por ID:', error);
        throw error;
    }
};

/**
 * Busca pagamentos por reserva
 * @param {number} reservaId - ID da reserva
 * @returns {Promise<Array>} Lista de pagamentos da reserva
 */
const buscarPagamentosPorReserva = async (reservaId) => {
    const query = 'SELECT * FROM pagamentos WHERE reserva_id = $1 ORDER BY data_criacao DESC';

    try {
        const { rows } = await pool.query(query, [reservaId]);
        return rows;
    } catch (error) {
        logger.error('Erro ao buscar pagamentos por reserva:', error);
        throw error;
    }
};

/**
 * Busca o último pagamento de uma reserva
 * @param {number} reservaId - ID da reserva
 * @returns {Promise<Object|null>} Último pagamento da reserva ou null se não encontrado
 */
const buscarUltimoPagamentoPorReserva = async (reservaId) => {
    const query = `
        SELECT * FROM pagamentos
        WHERE reserva_id = $1
        ORDER BY data_criacao DESC
        LIMIT 1
    `;

    try {
        const { rows } = await pool.query(query, [reservaId]);
        return rows[0] || null;
    } catch (error) {
        logger.error('Erro ao buscar último pagamento da reserva:', error);
        throw error;
    }
};

/**
 * Busca pagamentos por ID do usuário com suporte a paginação
 * @param {number} usuarioId - ID do usuário
 * @param {number} [limite=10] - Limite de resultados por página
 * @param {number} [offset=0] - Offset para paginação
 * @returns {Promise<{pagamentos: Array, total: number}>} Lista de pagamentos e total de registros
 */
async function listarPorUsuario(usuarioId, limite = 10, offset = 0) {
    const client = await pool.connect();

    try {
        // Inicia uma transação
        await client.query('BEGIN');

        // Primeiro, busca o total de registros
        const countQuery = `
            SELECT COUNT(*) as total
            FROM pagamentos p
            INNER JOIN reservas r ON p.reserva_id = r.id
            WHERE r.usuario_id = $1
        `;

        const countResult = await client.query(countQuery, [usuarioId]);
        const total = parseInt(countResult.rows[0].total, 10);

        // Depois busca os dados paginados
        const query = `
            SELECT p.*, r.horario_entrada, r.horario_saida, r.status
            FROM pagamentos p
            INNER JOIN reservas r ON p.reserva_id = r.id
            WHERE r.usuario_id = $1
            ORDER BY p.data_criacao DESC
            LIMIT $2 OFFSET $3
        `;

        const { rows } = await client.query(query, [usuarioId, limite, offset]);

        // Commit da transação
        await client.query('COMMIT');

        return {
            pagamentos: rows,
            total
        };

    } catch (error) {
        // Rollback em caso de erro
        await client.query('ROLLBACK');
        logger.error('Erro ao listar pagamentos por usuário:', error);
        throw error;
    } finally {
        // Libera o cliente de volta para o pool
        client.release();
    }
}

/**
 * Busca um pagamento pelo ID com verificação de permissão
 * @param {number} id - ID do pagamento
 * @param {number} [usuarioId] - ID do usuário para verificação de permissão (opcional)
 * @returns {Promise<Object|null>} Dados do pagamento ou null se não encontrado
 */
async function buscarPorIdComPermissao(id, usuarioId = null) {
    try {
        let query = `
            SELECT p.*, r.usuario_id, r.estacionamento_id
            FROM pagamentos p
            INNER JOIN reservas r ON p.reserva_id = r.id
            WHERE p.id = $1
        `;

        const params = [id];

        // Se o usuário for fornecido, adiciona verificação de permissão
        if (usuarioId) {
            query += ' AND (r.usuario_id = $2 OR EXISTS (' +
                'SELECT 1 FROM estacionamentos e ' +
                'WHERE e.id = r.estacionamento_id AND e.usuario_id = $2' +
            '))';
            params.push(usuarioId);
        }

        const { rows } = await pool.query(query, params);

        if (rows.length === 0) {
            return null;
        }

        return rows[0];

    } catch (error) {
        logger.error('Erro ao buscar pagamento por ID com permissão:', error);
        throw error;
    }
}

/**
 * Atualiza os dados adicionais de um pagamento
 * @param {number} id - ID do pagamento
 * @param {Object} dadosAdicionais - Novos dados adicionais
 * @returns {Promise<boolean>} Verdadeiro se atualizado com sucesso
 */
async function atualizarDadosAdicionais(id, dadosAdicionais) {
    const query = `
        UPDATE pagamentos
        SET dados_retorno = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id
    `;

    try {
        const { rowCount } = await pool.query(query, [dadosAdicionais, id]);
        return rowCount > 0;
    } catch (error) {
        logger.error('Erro ao atualizar dados adicionais do pagamento:', error);
        throw error;
    }
}

/**
 * Busca pagamentos por status
 * @param {string} status - Status do pagamento
 * @param {number} [limite=100] - Limite de resultados
 * @returns {Promise<Array>} Lista de pagamentos com o status especificado
 */
async function buscarPorStatus(status, limite = 100) {
    const query = `
        SELECT * FROM pagamentos
        WHERE status = $1
        ORDER BY data_criacao DESC
        LIMIT $2
    `;

    try {
        const { rows } = await pool.query(query, [status, limite]);
        return rows;
    } catch (error) {
        logger.error('Erro ao buscar pagamentos por status:', error);
        throw error;
    }
}

/**
 * Busca pagamentos por método de pagamento
 * @param {string} metodo - Método de pagamento
 * @param {number} [limite=100] - Limite de resultados
 * @returns {Promise<Array>} Lista de pagamentos com o método especificado
 */
async function buscarPorMetodo(metodo, limite = 100) {
    const query = `
        SELECT * FROM pagamentos
        WHERE metodo_pagamento = $1
        ORDER BY data_criacao DESC
        LIMIT $2
    `;

    try {
        const { rows } = await pool.query(query, [metodo, limite]);
        return rows;
    } catch (error) {
        logger.error('Erro ao buscar pagamentos por método:', error);
        throw error;
    }
}

/**
 * Busca um pagamento por ID de transação externa
 * @param {string} transacaoId - ID da transação no provedor de pagamento
 * @returns {Promise<Object|null>} Dados do pagamento ou null se não encontrado
 */
async function buscarPorTransacaoId(transacaoId) {
    const query = `
        SELECT * FROM pagamentos
        WHERE dados_retorno->>'transacao_id' = $1
        OR dados_retorno->>'txid' = $1
        LIMIT 1
    `;

    try {
        const { rows } = await pool.query(query, [transacaoId]);
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        logger.error('Erro ao buscar pagamento por ID de transação:', error);
        throw error;
    }
}

/**
 * Atualiza o status de um pagamento e registra o motivo
 * @param {number} id - ID do pagamento
 * @param {string} status - Novo status
 * @param {string} [motivo] - Motivo da atualização (opcional)
 * @param {Object} [dadosExtras] - Dados extras para registrar (opcional)
 * @returns {Promise<boolean>} Verdadeiro se atualizado com sucesso
 */
async function atualizarStatusComMotivo(id, status, motivo = '', dadosExtras = {}) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Primeiro, busca os dados atuais para registrar no histórico
        const { rows } = await client.query('SELECT * FROM pagamentos WHERE id = $1 FOR UPDATE', [id]);

        if (rows.length === 0) {
            throw new Error('Pagamento não encontrado');
        }

        const pagamentoAtual = rows[0];
        const historico = Array.isArray(pagamentoAtual.historico) ?
            [...pagamentoAtual.historico] : [];

        // Adiciona o novo registro ao histórico
        historico.push({
            status_anterior: pagamentoAtual.status,
            novo_status: status,
            data: new Date(),
            motivo,
            dados_extras: dadosExtras
        });

        // Atualiza o pagamento
        const updateQuery = `
            UPDATE pagamentos
            SET status = $1,
                historico = $2,
                data_atualizacao = NOW()
            WHERE id = $3
            RETURNING id
        `;

        const updateResult = await client.query(updateQuery, [status, JSON.stringify(historico), id]);

        await client.query('COMMIT');
        return updateResult.rowCount > 0;

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao atualizar status do pagamento com motivo:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    PAGAMENTO_STATUS,
    TIPO_PAGAMENTO,
    criarPagamento,
    atualizarStatusPagamento,
    buscarPagamentoPorId,
    buscarPagamentosPorReserva,
    buscarUltimoPagamentoPorReserva,
    listarPorUsuario,
    buscarPorIdComPermissao,
    atualizarDadosAdicionais,
    buscarPorStatus,
    buscarPorMetodo,
    buscarPorTransacaoId,
    atualizarStatusComMotivo
};
