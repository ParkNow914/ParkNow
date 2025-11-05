// models/estacionamentoModel.js
// Contém as funções para interagir com a tabela 'estacionamentos'.

const { sequelize } = require('../config/db.postgres');
const { QueryTypes, Op } = require('sequelize');
const logger = require('../utils/logger');
const cache = require('../utils/cache'); // Para invalidar cache
const { PAGAMENTO_STATUS, PAYMENT_METHODS } = require('../config/constants');
const { Estacionamento } = require('../models'); // Importa o modelo Estacionamento

const CACHE_KEY_LIST = 'estacionamentos_list'; // Chave de cache

/**
 * Busca todos os estacionamentos com contagem de vagas livres atual.
 * @returns {Promise<Array<object>>}
 */
const findAll = async () => {
    // Tenta obter do cache primeiro
    const cachedData = cache.get(CACHE_KEY_LIST);
    if (cachedData !== undefined) return cachedData;

    // Se não está no cache, busca no DB
    const sql = `
        SELECT
            e.id, e.nome, e.latitude, e.longitude, e.endereco, e.vagas as vagas_total,
            e.preco_hora, e.preco_dia, e.foto,
            (SELECT COUNT(*) FROM vagas v WHERE v.estacionamento_id = e.id AND v.status = 'livre') as vagas_livres_agora
        FROM estacionamentos e
        ORDER BY e.nome
    `;
    try {
        const result = await sequelize.query(sql, {
            type: QueryTypes.SELECT
        });
        // Salva no cache antes de retornar
        cache.set(CACHE_KEY_LIST, result); // Usa TTL padrão do cache
        return result;
    } catch (error) {
        logger.error('Erro em findAll (estacionamentos):', error);
        throw error;
    }
};

/**
 * Busca um estacionamento específico pelo ID (visão do cliente/pública).
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
const findById = async (id) => {
    const sql = `
        SELECT id, nome, latitude, longitude, endereco, vagas as vagas_total,
               preco_hora, preco_dia, descricao, foto, admin_id,
               chave_pix, tipo_chave_pix, nome_titular_pix
        FROM estacionamentos WHERE id = ? LIMIT 1
    `;
    try {
        const rows = await sequelize.query(sql, {
            replacements: [id],
            type: QueryTypes.SELECT
        });
        return rows[0];
    } catch (error) {
        logger.error(`Erro em findById (estacionamento ID: ${id}):`, { error: error.message });
        throw error;
    }
};

/**
 * Busca detalhes completos de um estacionamento para edição pelo admin.
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
const findByIdAdmin = async (id) => {
    const sql = `
        SELECT
            id, nome, latitude, longitude, endereco, telefone, email,
            capacidade_total, vagas_disponiveis, valor_hora, valor_diaria,
            valor_mensal, horario_abertura, horario_fechamento, status,
            data_cadastro, vagas, preco_hora, preco_dia, descricao, foto, admin_id,
            chave_pix, tipo_chave_pix, nome_titular_pix
        FROM estacionamentos
        WHERE id = ?
        LIMIT 1`;
    try {
        const rows = await sequelize.query(sql, {
            replacements: [id],
            type: QueryTypes.SELECT
        });
        return rows[0];
    } catch (error) {
        logger.error(`Erro em findByIdAdmin (estacionamento ID: ${id}):`, { error: error.message });
        throw error;
    }
};

/**
 * Cria um novo estacionamento.
 * @param {object} estData - Dados do estacionamento.
 * @returns {Promise<number>} ID do estacionamento criado.
 */
const createEstacionamento = async (estData) => {
    const {
        nome, latitude, longitude, endereco, foto, vagas,
        preco_hora, preco_dia, descricao, admin_id,
        chave_pix, tipo_chave_pix, nome_titular_pix
    } = estData;

    const sql = `
        INSERT INTO estacionamentos (
            nome, latitude, longitude, endereco, foto, vagas,
            preco_hora, preco_dia, descricao, admin_id,
            chave_pix, tipo_chave_pix, nome_titular_pix, data_cadastro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    try {
        const lat = (latitude && !isNaN(parseFloat(latitude))) ? parseFloat(latitude) : null;
        const lon = (longitude && !isNaN(parseFloat(longitude))) ? parseFloat(longitude) : null;
        const numVagas = (!isNaN(parseInt(vagas))) ? parseInt(vagas) : 0;
        const prHora = (!isNaN(parseFloat(preco_hora))) ? parseFloat(preco_hora) : 0.00;
        const prDia = (!isNaN(parseFloat(preco_dia))) ? parseFloat(preco_dia) : 0.00;

        const result = await sequelize.query(sql, {
            replacements: [
                nome,
                lat,
                lon,
                endereco,
                foto || null,
                numVagas,
                prHora,
                prDia,
                descricao || null,
                admin_id,
                chave_pix || null,
                tipo_chave_pix || null,
                nome_titular_pix || null
            ],
            type: QueryTypes.INSERT
        });

        logger.info(`Estacionamento criado ID: ${result[0]} por Admin ID: ${admin_id}`);
        cache.del(CACHE_KEY_LIST); // Invalida cache da lista
        return result[0];
    } catch (error) {
        logger.error('Erro em createEstacionamento:', { admin_id, error: error.message });
        throw error;
    }
};

/**
 * Atualiza os dados de um estacionamento (admin).
 * @param {number} id - ID do estacionamento a atualizar.
 * @param {object} estData - Dados a serem atualizados.
 * @returns {Promise<boolean>} true se atualizou.
 */
const updateEstacionamentoAdmin = async (id, estData) => {
    let sql = 'UPDATE estacionamentos SET ';
    const params = [];
    const fieldsToUpdate = [];
    const allowedFields = [
        'nome', 'latitude', 'longitude', 'endereco', 'foto', 'vagas',
        'preco_hora', 'preco_dia', 'descricao', 'admin_id',
        'chave_pix', 'tipo_chave_pix', 'nome_titular_pix'
    ];

    allowedFields.forEach(field => {
        if (estData.hasOwnProperty(field)) {
            fieldsToUpdate.push(`${field} = ?`);
            const value = estData[field];
            if (['latitude', 'longitude', 'preco_hora', 'preco_dia'].includes(field)) {
                params.push((value === '' || value === null || isNaN(parseFloat(value))) ? null : parseFloat(value));
            } else if (field === 'vagas' || field === 'admin_id') {
                params.push((value === '' || value === null || isNaN(parseInt(value))) ? null : parseInt(value));
            } else {
                params.push((value === '' || value === null) ? null : value);
            }
        }
    });

    if (fieldsToUpdate.length === 0) {
        logger.warn(`[Estacionamento Update] Nenhum campo válido para ID ${id}.`);
        return false;
    }

    sql += fieldsToUpdate.join(', ');
    sql += ' WHERE id = ?';
    params.push(id);

    try {
        const result = await sequelize.query(sql, {
            replacements: params,
            type: QueryTypes.UPDATE
        });

        if(result[1] > 0) {
            logger.info(`Estacionamento ID ${id} atualizado. Campos: ${fieldsToUpdate.map(f=>f.split('=')[0].trim()).join(',')}`);
            cache.del(CACHE_KEY_LIST); // Invalida cache da lista
        }
        return result[1] > 0;
    } catch (error) {
        logger.error(`Erro em updateEstacionamentoAdmin (ID: ${id}):`, { error: error.message });
        throw error;
    }
};

/**
 * Exclui um estacionamento e suas vagas (requer conexão de transação).
 * @param {number} id - ID do estacionamento a excluir.
 * @param {object} connection - Conexão da transação.
 * @returns {Promise<boolean>} true se excluído.
 */
const deleteEstacionamentoAdmin = async (id, connection) => {
    const deleteLogsVeiculosSql = 'DELETE FROM logs_veiculos WHERE vaga_id IN (SELECT id FROM vagas WHERE estacionamento_id = ?)';
    const deleteReservasSql = 'DELETE FROM reservas WHERE estacionamento_id = ?';
    const deleteVagasSql = 'DELETE FROM vagas WHERE estacionamento_id = ?';
    const deleteEstSql = 'DELETE FROM estacionamentos WHERE id = ?';

    try {
        // Ordem de exclusão para respeitar FKs (ou usar ON DELETE CASCADE)
        // Usando a transação passada para todas as operações
        await connection.query(deleteLogsVeiculosSql, {
            replacements: [id],
            transaction: connection.transaction
        });

        await connection.query(deleteReservasSql, {
            replacements: [id],
            transaction: connection.transaction
        });

        const [vagasResult] = await connection.query(deleteVagasSql, {
            replacements: [id],
            transaction: connection.transaction
        });

        const [estResult] = await connection.query(deleteEstSql, {
            replacements: [id],
            transaction: connection.transaction
        });

        logger.warn(`[Estacionamento Delete] Estacionamento ID ${id} e vagas relacionadas excluídas.`);
        cache.del(CACHE_KEY_LIST); // Invalida cache
        return estResult.affectedRows > 0;
    } catch (error) {
        logger.error(`Erro em deleteEstacionamentoAdmin (ID: ${id}):`, { error: error.message });
        throw error;
    } // Propaga erro para rollback
};

/**
 * Busca as configurações de pagamento de um estacionamento
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {object} [transaction] - Transação opcional
 * @returns {Promise<object|null>} Configurações de pagamento ou null se não encontrado
 */
const buscarConfiguracaoPagamento = async (estacionamentoId, transaction = null) => {
    try {
        // Não passa transaction se for um client do pg (não Sequelize)
        const options = {
            attributes: [
                'chave_pix', 'tipo_chave_pix', 'nome_titular_pix'
            ],
            raw: true
        };

        // Apenas adiciona transaction se for uma transação do Sequelize
        if (transaction && transaction.constructor.name === 'Transaction') {
            options.transaction = transaction;
        }

        const estacionamento = await Estacionamento.findByPk(estacionamentoId, options);

        if (!estacionamento) return null;

        return {
            chave_pix: estacionamento.chave_pix,
            tipo_chave_pix: estacionamento.tipo_chave_pix,
            nome_titular: estacionamento.nome_titular_pix
        };
    } catch (error) {
        logger.error(`Erro ao buscar configuração de pagamento do estacionamento ${estacionamentoId}:`, error);
        throw error;
    }
};

/**
 * Atualiza ou cria as configurações de pagamento de um estacionamento
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {object} config - Dados da configuração
 * @param {string} config.tipo_chave_pix - Tipo da chave PIX
 * @param {string} config.chave_pix - Valor da chave PIX
 * @param {string} config.nome_titular - Nome do titular da conta
 * @param {string} [config.banco] - Nome do banco (opcional)
 * @param {string} [config.tipo_conta='CONTA_CORRENTE'] - Tipo de conta
 * @param {string} [config.agencia] - Número da agência (opcional)
 * @param {string} [config.conta] - Número da conta (opcional)
 * @param {object} [transaction] - Transação opcional
 * @returns {Promise<object>} Configuração atualizada/criada
 */
const atualizarConfiguracaoPagamento = async (estacionamentoId, config, transaction = null) => {
    const t = transaction || await Estacionamento.sequelize.transaction();
    const shouldCommit = !transaction;

    try {
        const {
            tipo_chave_pix,
            chave_pix,
            nome_titular,
            banco,
            tipo_conta = 'CONTA_CORRENTE',
            agencia,
            conta,
            aceita_cartao_credito,
            aceita_cartao_debito
        } = config;

        // Validações
        if (!tipo_chave_pix) {
            throw new Error('Tipo da chave PIX é obrigatório');
        }

        if (!chave_pix) {
            throw new Error('Chave PIX é obrigatória');
        }

        if (!nome_titular) {
            throw new Error('Nome do titular é obrigatório');
        }

        // Verifica se o estacionamento existe
        const estacionamento = await Estacionamento.findByPk(estacionamentoId, { transaction: t });
        if (!estacionamento) {
            throw new Error('Estacionamento não encontrado');
        }

        // Prepara os dados para atualização
        const dadosAtualizacao = {
            tipo_chave_pix,
            chave_pix,
            nome_titular_pix: nome_titular,
            aceita_cartao_credito: !!aceita_cartao_credito,
            aceita_cartao_debito: !!aceita_cartao_debito,
            dados_pagamento: {
                banco: banco || null,
                tipo_conta,
                agencia: agencia || null,
                conta: conta || null,
                // Mantém outros dados que possam existir
                ...(estacionamento.dados_pagamento || {})
            }
        };

        // Atualiza o estacionamento
        const [updated] = await Estacionamento.update(dadosAtualizacao, {
            where: { id: estacionamentoId },
            transaction: t
        });

        if (updated === 0) {
            throw new Error('Falha ao atualizar configuração de pagamento');
        }

        if (shouldCommit) {
            await t.commit();
        }

        // Retorna os dados atualizados
        return {
            ...dadosAtualizacao,
            nome_titular: dadosAtualizacao.nome_titular_pix,
            ...dadosAtualizacao.dados_pagamento
        };

    } catch (error) {
        if (shouldCommit && t) {
            await t.rollback();
        }

        logger.error('Erro ao atualizar configuração de pagamento:', {
            estacionamentoId,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }
};

/**
 * Verifica se um estacionamento está configurado para receber pagamentos
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {object} [transaction] - Transação opcional
 * @returns {Promise<{valido: boolean, motivo?: string, config?: object}>}
 */
const validarConfiguracaoPagamento = async (estacionamentoId, transaction = null) => {
    try {
        const config = await buscarConfiguracaoPagamento(estacionamentoId, transaction);

        if (!config) {
            return {
                valido: false,
                motivo: 'Estacionamento não encontrado'
            };
        }

        // Verifica se tem chave PIX configurada
        if (!config.chave_pix || !config.tipo_chave_pix || !config.nome_titular) {
            return {
                valido: false,
                motivo: 'Configuração de PIX incompleta',
                config: {
                    precisaConfigurarPix: true
                }
            };
        }

        // Verifica se tem dados bancários para estorno (opcional)
        const precisaConfigurarDadosBancarios = !config.banco || !config.agencia || !config.conta;

        return {
            valido: true,
            config: {
                precisaConfigurarDadosBancarios,
                ...config
            }
        };

    } catch (error) {
        logger.error('Erro ao validar configuração de pagamento:', {
            estacionamentoId,
            error: error.message,
            stack: error.stack
        });
        return {
            valido: false,
            motivo: 'Erro ao validar configuração de pagamento'
        };
    }
};

/**
 * Busca estacionamentos que aceitam um determinado método de pagamento
 * @param {string} metodoPagamento - Método de pagamento (ex: 'pix', 'cartao_credito')
 * @returns {Promise<Array<object>>} Lista de estacionamentos
 */
const buscarPorMetodoPagamento = async (metodoPagamento) => {
    try {
        // Se o método de pagamento for cartão de crédito ou débito, retorna array vazio
        // já que esses métodos não são mais suportados
        if (metodoPagamento === 'cartao_credito' || metodoPagamento === 'cartao_debito') {
            return [];
        }

        const where = { status: 'ATIVO' };

        // Filtra apenas por PIX, que é o único método suportado agora
        if (metodoPagamento === 'pix') {
            where.chave_pix = { [Op.ne]: null };
            where.tipo_chave_pix = { [Op.ne]: null };
            where.nome_titular_pix = { [Op.ne]: null };
        } else {
            // Se não for PIX, retorna vazio
            return [];
        }

        const estacionamentos = await Estacionamento.findAll({
            where,
            attributes: [
                'id', 'nome', 'latitude', 'longitude', 'endereco',
                'vagas', 'preco_hora', 'preco_dia', 'foto',
                'chave_pix', 'tipo_chave_pix', 'nome_titular_pix'
            ],
            raw: true
        });

        // Formata o resultado para manter compatibilidade
        return estacionamentos.map(est => ({
            ...est,
            vagas_total: est.vagas,
            vagas_disponiveis: est.vagas, // Valor simplificado, pode ser aprimorado
            aceita_cartao_credito: false, // Definido como false já que não aceita mais
            aceita_cartao_debito: false   // Definido como false já que não aceita mais
        }));

    } catch (error) {
        logger.error('Erro ao buscar estacionamentos por método de pagamento:', {
            error: error.message,
            stack: error.stack,
            metodoPagamento
        });
        throw error;
    }
};

module.exports = {
    findAll,
    findById,
    findByIdAdmin,
    createEstacionamento,
    updateEstacionamentoAdmin,
    deleteEstacionamentoAdmin,
    buscarConfiguracaoPagamento,
    atualizarConfiguracaoPagamento,
    validarConfiguracaoPagamento,
    buscarPorMetodoPagamento
};
