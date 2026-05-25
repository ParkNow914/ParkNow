// controllers/adminApiController.js
// Lida com a lógica da API do painel de administração.

// Models
const vagaModel = require('../models/vagaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const userModel = require('../models/userModel');
const reservaModel = require('../models/reservaModel');
const logModel = require('../models/logModel');
// Utils
const logger = require('../utils/logger');
const pool = require('../models/db'); // Para transações
const { AppError, NotFoundError, BadRequestError, AuthorizationError } = require('../utils/AppError'); // Erros customizados
const cache = require('../utils/cache'); // Para invalidar cache se necessário
// Services
const socketService = require('../services/socketService'); // Para emitir eventos

// --- Helpers ---
const getIp = (req) => req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'IP N/A';

/**
 * Garante que o admin autenticado é dono do estacionamento informado.
 * Lança NotFoundError se o estacionamento não existir,
 * ou AuthorizationError se pertencer a outro admin.
 * Retorna o registro carregado para reuso pelo caller.
 * Defesa contra BOLA (Broken Object Level Authorization) nos endpoints admin.
 */
const assertAdminOwnsEstacionamento = async (adminId, estacionamentoId) => {
    const est = await estacionamentoModel.findByIdAdmin(estacionamentoId);
    if (!est) throw new NotFoundError('Estacionamento não encontrado.');
    if (parseInt(est.admin_id) !== parseInt(adminId)) {
        throw new AuthorizationError('Você não tem permissão sobre este estacionamento.');
    }
    return est;
};

// --- Vagas ---
/** Busca todas as vagas com detalhes para admin */
const getAllVagas = async (req, res, next) => {
    try {
        // Se o estacionamentoId foi fornecido como query param, filtra por ele
        const estacionamentoId = req.query.estacionamentoId;
        const vagas = await vagaModel.findAllVagasAdmin(estacionamentoId);
        res.json(vagas);
    } catch (error) {
        next(error);
    }
};

/** Busca vagas ocupadas para o painel do admin */
const getVagasOcupadas = async (req, res, next) => {
    try {
        // Opcional: filtrar por estacionamento específico
        const estacionamentoId = req.query.estacionamentoId;
        const vagas = await vagaModel.findOcupadas(estacionamentoId);
        res.json(vagas);
    } catch (error) {
        next(error);
    }
};

/** Obtém o tempo estacionado (em segundos) armazenado no DB para uma vaga */
const getTempoEstacionadoDb = async (req, res, next) => {
    // Validação do ID feita na rota
    try {
        const { id } = req.params;
        const tempo = await vagaModel.findTempoDbById(id);
        if (tempo === null || tempo === undefined) throw new NotFoundError('Vaga ou tempo não encontrado.');
        res.json({ tempoEstacionado: tempo });
    } catch (error) { next(error); }
};

/** Registra entrada manual de veículo por admin */
const registrarEntrada = async (req, res, next) => {
    // Validação feita na rota
    const { numero } = req.params;
    const { placa, tipoVeiculo, estacionamentoId } = req.body;
    const adminId = req.admin.id; // Do middleware protectAdmin
    const ipAddress = getIp(req);
    try {
        const vaga = await vagaModel.findByNumeroAndEstacionamento(numero, estacionamentoId);
        if (!vaga) throw new NotFoundError(`Vaga ${numero} não encontrada no Estacionamento ${estacionamentoId}.`);
        if (vaga.status !== 'livre') throw new AppError(`Vaga ${numero} não está livre (status: ${vaga.status}).`, 409); // 409 Conflict

        const success = await vagaModel.ocuparVagaAdmin(vaga.id, placa.toUpperCase(), tipoVeiculo, estacionamentoId);
        if (!success) throw new AppError("Falha ao registrar entrada (possível concorrência?).", 500);

        // Busca dados atualizados para emitir
        const vagaAtualizada = await vagaModel.findById(vaga.id);

        // Emite evento e cria logs
        socketService.emitAtualizacaoVaga(estacionamentoId, vagaAtualizada);
        logger.info(`Admin ${adminId} registrou entrada Vaga ${numero} (${placa}) Est. ${estacionamentoId}`, { ip: ipAddress });
        await logModel.createAdminLog(adminId, `Registrou entrada Vaga ${numero} (${placa}) Est. ${estacionamentoId}`, ipAddress);
        await logModel.createVeiculoLogEntrada(estacionamentoId, vaga.id, placa.toUpperCase(), tipoVeiculo, vagaAtualizada?.entrada || new Date());

        res.status(201).json({ success: 'Entrada registrada com sucesso.', vaga: vagaAtualizada }); // Retorna 201 Created
    } catch (error) { next(error); }
};

/** Registra saída manual de veículo por admin */
const registrarSaida = async (req, res, next) => {
    // Validação feita na rota
    const { id: vagaId } = req.params;
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    try {
        // liberarVagaAdmin já busca a vaga e valida se está ocupada
        const result = await vagaModel.liberarVagaAdmin(vagaId);
        if (!result.success) {
            // A mensagem de erro específica vem do model
            throw new BadRequestError(result.message || "Falha ao registrar saída.");
        }

        const vagaInfo = result.vagaInfo;
        // Calcula tempo em segundos (pode usar o salvo ou recalcular)
        let tempoSegundos = vagaInfo.tempo_estacionado || 0;
        if (vagaInfo.entrada) { const e = new Date(vagaInfo.entrada).getTime(); const s = Date.now(); tempoSegundos = Math.max(0, Math.floor((s - e) / 1000)); }

        // Emite evento e cria logs
        const vagaLiberada = { id: vagaId, status: 'livre', numero: vagaInfo.numero, estacionamento_id: vagaInfo.estacionamento_id };
        socketService.emitAtualizacaoVaga(vagaInfo.estacionamento_id, vagaLiberada);
        logger.info(`Admin ${adminId} registrou saída Vaga ${vagaInfo.numero} (Placa: ${vagaInfo.placa||'N/A'}) Est. ${vagaInfo.estacionamento_id}`, { ip: ipAddress });

        const logResult = await Promise.all([
            logModel.createAdminLog(adminId, `Registrou saída Vaga ${vagaInfo.numero} (Placa: ${vagaInfo.placa||'N/A'}) Est. ${vagaInfo.estacionamento_id}`, ipAddress),
            logModel.updateVeiculoLogSaidaByVagaId(vagaId, tempoSegundos, null)
        ]);

        // Verifica se o log de veículo foi atualizado com sucesso
        if (!logResult[1]?.success) {
            logger.error(`Falha ao atualizar log de veículo para vaga ${vagaId}`, { 
                error: logResult[1]?.message || 'Erro desconhecido' 
            });
            // Não interrompemos o fluxo, mas registramos o erro
        }

        res.json({ 
            success: 'Saída registrada com sucesso.', 
            tempoEstacionado: tempoSegundos,
            logAtualizado: logResult[1]?.success || false
        });
    } catch (error) { next(error); }
};

/** Endpoint para o cron job (ou chamada manual) atualizar tempos no DB */
const atualizarTempoEstacionadoGlobal = async (req, res, next) => {
    try {
        // A lógica principal está no Model, que já loga internamente
        const affectedRows = await vagaModel.updateAllTemposEstacionados();
        res.json({ success: `Tempo estacionado no DB atualizado para ${affectedRows} vagas.` });
    } catch (error) { next(error); }
};

// --- Configuração/Gerenciamento Estacionamento ---
/** Ajusta o número total de vagas de um estacionamento */
const atualizarNumeroDeVagas = async (req, res, next) => {
    // Validação feita na rota
    const { numeroDeVagas, estacionamentoId } = req.body;
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    try {
        await assertAdminOwnsEstacionamento(adminId, estacionamentoId);

        // adjustVagasCount lida com adição/remoção e transação
        const result = await vagaModel.adjustVagasCount(estacionamentoId, parseInt(numeroDeVagas));
        if (!result.success) throw new BadRequestError(result.message); // Usa mensagem do model

        // Invalida cache da lista de estacionamentos (se existir)
        cache.del('estacionamentos_list');
        logger.info(`[Cache] Invalidado: estacionamentos_list`);

        // Log e resposta
        logger.info(`Admin ${adminId} ajustou vagas Est. ${estacionamentoId} para ${numeroDeVagas}`, { ip: ipAddress, added: result.added, removed: result.removed });
        await logModel.createAdminLog(adminId, `Ajustou vagas Est. ${estacionamentoId} para ${numeroDeVagas} (Add: ${result.added}, Rem: ${result.removed})`, ipAddress);
        res.json({ success: `Número de vagas atualizado. Adicionadas: ${result.added}, Removidas: ${result.removed}.` });
    } catch (error) { next(error); }
};

/** Lista todos estacionamentos para Admin */
const getAllEstacionamentosAdmin = async (req, res, next) => {
    try {
        // Busca todos os campos para o admin
        const estacionamentos = await estacionamentoModel.findAll(); // findAll já busca tudo que precisamos? Ajustar se necessário.
        res.json(estacionamentos);
    } catch (error) { next(error); }
};

/** Busca detalhes de um estacionamento para edição */
const getEstacionamentoByIdAdmin = async (req, res, next) => {
    try {
        const { estacionamentoId } = req.params;
        const adminId = req.admin.id;
        const estacionamento = await assertAdminOwnsEstacionamento(adminId, estacionamentoId);
        res.json(estacionamento);
    } catch (error) { next(error); }
};

/** Busca vagas de um estacionamento específico */
const getVagasByEstacionamentoId = async (req, res, next) => {
    try {
        const { estacionamentoId } = req.params;
        
        // Verificar se o estacionamento existe
        const estacionamento = await estacionamentoModel.findById(estacionamentoId);
        if (!estacionamento) throw new NotFoundError('Estacionamento não encontrado.');
        
        // Buscar vagas do estacionamento
        const vagas = await vagaModel.findByEstacionamentoId(estacionamentoId);
        
        res.json(vagas);
    } catch (error) { next(error); }
};

/** Cria um novo estacionamento */
const createEstacionamentoAdmin = async (req, res, next) => {
    // Validação feita na rota
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    const { nome, endereco, latitude, longitude, numeroVagas, precoHora, precoDia, descricao, admin_id: targetAdminId } = req.body; // Pega admin_id do body
    const fotoFile = req.file; // Do Multer

    // Garante que está criando para o admin logado
    if (parseInt(targetAdminId) !== adminId) {
         return next(new AuthorizationError('Você não pode criar um estacionamento para outro administrador.'));
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const estData = { nome, endereco, latitude, longitude, foto: fotoFile ? fotoFile.filename : null, vagas: parseInt(numeroVagas), preco_hora: precoHora, preco_dia: precoDia, descricao, admin_id: adminId };
        const novoEstId = await estacionamentoModel.createEstacionamento(estData); // Usa pool
        await vagaModel.createInitialVagas(novoEstId, parseInt(numeroVagas), client); // Usa transaction

        // Always-free: nada de gateway externo. O recebimento é feito direto
        // na chave PIX do estacionamento (preenchida no cadastro/edição).

        await client.query('COMMIT');

        cache.del('estacionamentos_list'); // Invalida cache
        logger.info(`Admin ${adminId} criou Est. ID ${novoEstId} (${nome})`, { ip: ipAddress });
        await logModel.createAdminLog(adminId, `Criou Estacionamento ID ${novoEstId} (${nome})`, ipAddress);
        res.status(201).json({ success: 'Estacionamento criado com sucesso!', id: novoEstId });
    } catch (error) { 
        await client.query('ROLLBACK'); 
        next(error); 
    } finally { 
        client.release(); 
    }
};

/** Edita dados de um estacionamento */
const updateEstacionamento = async (req, res, next) => {
    // Validação feita na rota
    const { estacionamentoId } = req.params;
    const estData = req.body;
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    try {
        const estOriginal = await assertAdminOwnsEstacionamento(adminId, estacionamentoId);
        
        // Impedir mudança do admin_id via PUT normal? Ou permitir se for superadmin?
        if (estData.admin_id && parseInt(estData.admin_id) !== estOriginal.admin_id) {
             // return next(new BadRequestError("Não é permitido alterar o administrador responsável por esta rota."));
             logger.warn(`Admin ${adminId} tentando alterar admin_id do Est. ${estacionamentoId}`);
             // Permitir por enquanto, mas logar
        }
        
        // Se estiver atualizando a chave PIX, validar se já existe uma reserva ativa
        if (estData.chave_pix || estData.tipo_chave_pix) {
            const reservaAtiva = await reservaModel.findActiveReservaByEstacionamento(estacionamentoId);
            if (reservaAtiva) {
                return next(new BadRequestError("Não é possível alterar a chave PIX com reservas ativas no estacionamento."));
            }
        }
        
        // TODO: Lógica para lidar com upload de nova foto (excluir antiga?)

        const updated = await estacionamentoModel.updateEstacionamentoAdmin(estacionamentoId, estData);
        if (!updated) return res.status(304).send(); // Not modified

        cache.del('estacionamentos_list'); // Invalida cache
        logger.info(`Admin ${adminId} editou Estacionamento ID ${estacionamentoId}`, { ip: ipAddress, changes: estData });
        await logModel.createAdminLog(adminId, `Editou Estacionamento ID ${estacionamentoId}`, ipAddress);
        const estAtualizado = await estacionamentoModel.findByIdAdmin(estacionamentoId); // Busca dados atualizados
        res.json({ success: 'Estacionamento atualizado!', estacionamento: estAtualizado });
    } catch (error) { next(error); }
};

/** Exclui um estacionamento e suas vagas */
const deleteEstacionamento = async (req, res, next) => {
    // Validação feita na rota
    const { estacionamentoId } = req.params;
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const est = await assertAdminOwnsEstacionamento(adminId, estacionamentoId);

        const deleted = await estacionamentoModel.deleteEstacionamentoAdmin(estacionamentoId, client); // Passa client
        if (!deleted) throw new AppError('Falha ao excluir estacionamento.', 500); // Erro inesperado se chegou aqui

        await client.query('COMMIT');
        cache.del('estacionamentos_list'); // Invalida cache
        logger.warn(`Admin ${adminId} EXCLUIU Estacionamento ID ${estacionamentoId} (${est.nome})`, { ip: ipAddress });
        await logModel.createAdminLog(adminId, `Excluiu Estacionamento ID ${estacionamentoId} (${est.nome})`, ipAddress);
        res.status(200).json({ success: 'Estacionamento e vagas excluídos.' });
    } catch (error) { 
        await client.query('ROLLBACK'); 
        next(error); 
    } finally { 
        client.release(); 
    }
};

// --- Gerenciamento de Usuários (Admin) ---
const getAllUsersAdmin = async (req, res, next) => {
    try {
        const estacionamentoId = req.query.estacionamentoId || null;
        
        // Se não houver estacionamentoId, retorna vazio ou todos os usuários
        // Dependendo do seu caso de uso, você pode querer retornar um erro
        if (!estacionamentoId) {
            return res.json([]);
        }
        
        const users = await userModel.findAllUsersAdmin(estacionamentoId);
        res.json(users);
    } catch (error) { 
        logger.error('Erro ao buscar usuários:', error);
        next(error); 
    }
};

const setUserStatus = async (req, res, next) => {
    // Validação feita na rota
    const { userId } = req.params;
    const { status } = req.body;
    const adminId = req.admin.id;
    const ipAddress = getIp(req);
    try {
        const updated = await userModel.setUserStatusAdmin(userId, status);
        if (!updated) throw new NotFoundError('Usuário não encontrado.');

        logger.info(`Admin ${adminId} alterou status User ID ${userId} para ${status}`, { ip: ipAddress });
        await logModel.createAdminLog(adminId, `Alterou status User ID ${userId} para ${status}`, ipAddress);
        // Se desativar, talvez invalidar refresh tokens?
        if (status === 'inativo') {
            await userModel.clearRefreshTokenHash(userId); // Invalida sessão persistente
        }
        res.json({ success: `Status do usuário alterado para ${status}.` });
    } catch (error) { next(error); }
};

module.exports = {
    getAllVagas, getVagasOcupadas, getTempoEstacionadoDb, registrarEntrada, registrarSaida,
    atualizarTempoEstacionadoGlobal, atualizarNumeroDeVagas,
    getAllEstacionamentosAdmin, getEstacionamentoByIdAdmin, getVagasByEstacionamentoId, createEstacionamentoAdmin,
    updateEstacionamento, deleteEstacionamento,
    getAllUsersAdmin, setUserStatus
};