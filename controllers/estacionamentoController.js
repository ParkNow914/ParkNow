// controllers/estacionamentoController.js
const db = require('../models');
const { Estacionamento, HorarioFuncionamento } = db;
const vagaModel = require('../models/vagaModel');
const userModel = require('../models/userModel');
const dbUtils = require('../utils/dbUtils'); // Import dbUtils to get the pool
const { formatarTempo } = require('../utils/helpers');
const logger = require('../utils/logger');
const { AppError, NotFoundError, BadRequestError } = require('../utils/AppError');
const cache = require('../utils/cache');
const socketService = require('../services/socketService');
const config = require('../config');

// --- Funções de Estacionamento ---
// Função para calcular o status de ocupação e a cor do pin
const calcularStatusEstacionamento = (estacionamento) => {
    // Garantir que temos os valores necessários
    const vagasLivres = parseInt(estacionamento.dataValues?.vagas_livres_agora) || 0;
    const vagasTotais = parseInt(estacionamento.dataValues?.vagas) || 0;
    const estaEmManutencao = estacionamento.status === 'EM_MANUTENCAO';
    
    // Se não tem vagas totais definidas ou está em manutenção
    if (vagasTotais <= 0 || estaEmManutencao) {
        return {
            status: 'indisponivel',
            cor: '#808080', // Cinza
            descricao: 'Indisponível',
            percentualOcupacao: 100
        };
    }

    const percentualOcupacao = ((vagasTotais - vagasLivres) / vagasTotais) * 100;

    if (vagasLivres <= 0) {
        return {
            status: 'lotado',
            cor: '#FF0000', // Vermelho
            descricao: 'Lotado',
            percentualOcupacao: 100
        };
    } else if (percentualOcupacao >= 80) {
        return {
            status: 'quase_lotado',
            cor: '#FFA500', // Laranja
            descricao: 'Quase lotado',
            percentualOcupacao: Math.round(percentualOcupacao)
        };
    } else if (percentualOcupacao >= 50) {
        return {
            status: 'moderado',
            cor: '#FFD700', // Amarelo
            descricao: 'Moderado',
            percentualOcupacao: Math.round(percentualOcupacao)
        };
    } else {
        return {
            status: 'tranquilo',
            cor: '#008000', // Verde
            descricao: 'Tranquilo',
            percentualOcupacao: Math.round(percentualOcupacao)
        };
    }
};

const getAllEstacionamentos = async (req, res, next) => {
    const cacheKey = 'estacionamentos_list';
    try {
        let estacionamentos = cache.get(cacheKey); // Tenta pegar do cache
        if (estacionamentos === undefined) { // Cache miss
            logger.debug('[Cache] MISS para estacionamentos_list. Buscando no DB...');
            
            // Buscar estacionamentos com contagem de vagas livres e horários de funcionamento
            estacionamentos = await Estacionamento.findAll({
                attributes: [
                    'id', 'nome', 'latitude', 'longitude', 'endereco', 'vagas',
                    'preco_hora', 'preco_dia', 'foto', 'status',
                    // Contar vagas livres usando uma subconsulta segura
                    [
                        db.sequelize.literal(`(
                            SELECT COUNT(*) 
                            FROM "vagas" AS v 
                            WHERE v.estacionamento_id = "Estacionamento"."id" 
                            AND v.status = 'livre'
                        )`),
                        'vagas_livres_agora'
                    ]
                ],
                include: [
                    {
                        model: HorarioFuncionamento,
                        as: 'horariosFuncionamento',
                        attributes: ['dia_semana', 'aberto', 'horario_abertura', 'horario_fechamento'],
                        required: false
                    }
                ],
                order: [['nome', 'ASC']]
            });
            
            // Processar cada estacionamento para adicionar informações de status
            estacionamentos = estacionamentos.map(estacionamento => {
                const estacionamentoJson = estacionamento.toJSON();
                
                // Verificar se está fechado
                const agora = new Date();
                const diaSemana = agora.getDay();
                const horarioHoje = estacionamento.horariosFuncionamento?.find(h => h.dia_semana === diaSemana);
                
                let estaAberto = false;
                if (horarioHoje?.aberto) {
                    const horaAtual = agora.getHours() * 100 + agora.getMinutes();
                    const [horaAbertura, minAbertura] = horarioHoje.horario_abertura.split(':').map(Number);
                    const [horaFechamento, minFechamento] = horarioHoje.horario_fechamento.split(':').map(Number);
                    
                    const horarioAbertura = horaAbertura * 100 + minAbertura;
                    const horarioFechamento = horaFechamento * 100 + minFechamento;
                    
                    estaAberto = horaAtual >= horarioAbertura && horaAtual <= horarioFechamento;
                }
                
                // Calcular status de ocupação
                const statusOcupacao = calcularStatusEstacionamento(estacionamento);
                
                // Se estiver fechado ou em manutenção, forçar status de fechado
                if (!estaAberto || estacionamento.status === 'EM_MANUTENCAO') {
                    statusOcupacao.status = 'fechado';
                    statusOcupacao.cor = '#808080'; // Cinza
                    statusOcupacao.descricao = estacionamento.status === 'EM_MANUTENCAO' ? 'Em manutenção' : 'Fechado';
                }
                
                return {
                    ...estacionamentoJson,
                    statusOcupacao,
                    estaAberto
                };
            });
            
            // Salva no cache com TTL definido na config (ex: 5 minutos)
            cache.set(cacheKey, estacionamentos, config.cache.estacionamentosListTTL);
        }
        res.json(estacionamentos);
    } catch (error) { 
        next(error); 
    }
};

const getEstacionamentoById = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Buscar estacionamento com horários de funcionamento
        const estacionamento = await Estacionamento.findByPk(id, {
            include: [
                {
                    model: HorarioFuncionamento,
                    as: 'horariosFuncionamento',
                    attributes: ['id', 'dia_semana', 'aberto', 'horario_abertura', 'horario_fechamento'],
                    order: [['dia_semana', 'ASC']]
                }
            ]
        });
        
        if (!estacionamento) {
            throw new NotFoundError('Estacionamento não encontrado.');
        }
        
        // Se não tiver horários, criar os padrões
        if (!estacionamento.horariosFuncionamento || estacionamento.horariosFuncionamento.length === 0) {
            await Estacionamento.criarHorariosPadrao(id);
            // Buscar novamente com os horários recém-criados
            return getEstacionamentoById(req, res, next);
        }
        
        res.json(estacionamento);
    } catch (error) { 
        next(error); 
    }
};

// --- Funções de Vagas (Visão Usuário) ---
const getVagasByEstacionamentoId = async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const { status } = req.query;
        
        // Verificar se o estacionamento existe
        const estacionamento = await Estacionamento.findByPk(id);
        if (!estacionamento) {
            throw new NotFoundError('Estacionamento não encontrado.');
        }
        
        // Usar a pool de conexões diretamente
        client = await dbUtils.pool.connect();
        
        // Construir a consulta SQL - Explicitamente listar colunas para evitar problemas com colunas inexistentes
        let query = `
            SELECT 
                id, 
                numero, 
                status, 
                tipo_veiculo, 
                entrada, 
                placa, 
                usuario_id,
                tempo_estacionado, 
                reserva_id_ativa,
                tipo_veiculo as tipo,  -- Para compatibilidade com o frontend
                estacionamento_id  -- Adicionado explicitamente
            FROM vagas 
            WHERE estacionamento_id = $1
        `;
        
        const params = [id];
        
        // Adicionar filtro de status se fornecido
        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }
        
        query += ' ORDER BY numero ASC';
        
        // Executar a consulta
        const result = await client.query(query, params);
        
        res.json(result.rows);
    } catch (error) { 
        console.error('Erro ao buscar vagas:', error);
        next(error); 
    } finally {
        // Liberar o cliente de volta para a pool
        if (client) {
            client.release();
        }
    }
};

const getVagasLivresCount = async (req, res, next) => {
    try {
        const { estacionamentoId } = req.query;
        
        let count;
        
        if (estacionamentoId) {
            // Contar vagas livres para um estacionamento específico
            count = await db.Vaga.count({
                where: { 
                    estacionamento_id: estacionamentoId,
                    status: 'livre'
                }
            });
        } else {
            // Contar vagas livres em todos os estacionamentos
            count = await db.Vaga.count({
                where: { status: 'livre' }
            });
        }
        
        res.json({ 
            estacionamentoId: estacionamentoId || 'todos', 
            vagasLivres: count 
        });
    } catch (error) { 
        next(error); 
    }
};

// --- Funções de Ações em Vagas (Usuário) ---
const agendarVaga = async (req, res, next) => {
    const { vagaId } = req.params;
    const userId = req.user.id;
    
    // Adicionar feedback de processamento imediato
    res.set('X-Processing', 'true');
    
    // Iniciar transação para garantir consistência
    const transaction = await db.sequelize.transaction();
    
    try {
        // Buscar dados do usuário
        const usuario = await db.User.findByPk(userId, {
            attributes: ['id', 'nome', 'email', 'placa_veiculo'],
            transaction
        });
        
        if (!usuario) {
            throw new NotFoundError("Usuário não encontrado.");
        }
        
        if (!usuario.placa_veiculo) {
            throw new BadRequestError("Placa do veículo não cadastrada no perfil.");
        }

        // Buscar vaga com bloqueio para evitar condições de corrida
        const vaga = await db.Vaga.findByPk(vagaId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        
        if (!vaga) {
            throw new NotFoundError("Vaga não encontrada.");
        }
        
        // Verificar se a vaga está disponível
        if (vaga.status !== 'livre') {
            throw new AppError("Esta vaga não está mais disponível.", 409);
        }

        // Atualizar vaga para ocupada
        const agora = new Date();
        const vagaAtualizada = await vaga.update({
            status: 'ocupada',
            usuario_id: userId,
            placa: usuario.placa_veiculo,
            entrada: agora,
            saida: null,
            tempo_estacionado: 0,
            updated_at: agora
        }, { transaction });
        
        // Confirmar a transação
        await transaction.commit();
        
        // Dados para o socket
        const dadosSocket = {
            id: vagaAtualizada.id,
            status: 'ocupada',
            placa: usuario.placa_veiculo.toUpperCase(),
            entrada: agora,
            usuario_id: userId,
            tempo_estacionado: 0,
            numero: vagaAtualizada.numero
        };

        // Emitir eventos de socket
        socketService.emitVagaAtualizada(vagaAtualizada.estacionamento_id, vagaId, dadosSocket);
        socketService.emitEstadoVagasAtualizado(vagaAtualizada.estacionamento_id);
        
        // Notificar o usuário
        socketService.notificarUsuario(userId, 'vaga_ocupada', {
            vagaId: vagaAtualizada.id,
            estacionamentoId: vagaAtualizada.estacionamento_id,
            numeroVaga: vagaAtualizada.numero,
            placa: usuario.placa_veiculo.toUpperCase(),
            entrada: agora
        });
        
        logger.info(`Vaga ${vagaId} ocupada pelo usuário ${userId}`);

        // Responder ao cliente
        return res.status(200).json({ 
            success: true,
            message: "Vaga ocupada com sucesso!", 
            vaga: { 
                id: vagaAtualizada.id, 
                status: 'ocupada',
                estacionamentoId: vagaAtualizada.estacionamento_id,
                numeroVaga: vagaAtualizada.numero,
                entrada: agora
            } 
        });
        
    } catch (error) {
        // Desfazer transação em caso de erro
        if (transaction.finished !== 'commit') {
            await transaction.rollback();
        }
        
        // Tratar erros específicos
        if (error.message.includes("não está disponível") || 
            error.message.includes("já está ocupada")) {
            next(new AppError(error.message, 409)); // 409 Conflict
        } else if (error.message.includes("não encontrad")) {
            next(new NotFoundError(error.message));
        } else {
            next(error);
        }
    }
};

const getTempoEstacionado = async (req, res, next) => {
    try {
        const { vagaId } = req.params;
        const userId = req.user.id;
        
        // Buscar informações da vaga
        const vaga = await db.Vaga.findByPk(vagaId, {
            attributes: [
                'id', 'status', 'entrada', 'usuario_id',
                [db.sequelize.literal('EXTRACT(EPOCH FROM (NOW() - entrada))'), 'tempo_segundos']
            ]
        });
        
        if (!vaga) {
            throw new NotFoundError("Vaga não encontrada.");
        }
        
        // Se a vaga não estiver ocupada ou não tiver horário de entrada
        if (vaga.status !== 'ocupada' || !vaga.entrada) {
            return res.json({ 
                tempoEstacionado: "00:00:00",
                status: vaga.status || 'desconhecido',
                ocupada: false,
                isOcupante: false,
                segundos: 0,
                entrada: null,
                timestamp: Date.now(),
                serverTime: new Date().toISOString()
            });
        }
        
        // Calcular tempo decorrido
        const entradaTime = new Date(vaga.entrada).getTime();
        const agoraTime = Date.now();
        const diffMs = Math.max(0, agoraTime - entradaTime);
        const diffSegundos = Math.floor(diffMs / 1000);
        const tempoFormatado = formatarTempo(diffMs);
        
        // Verificar se o usuário atual é o ocupante
        const isOcupante = vaga.usuario_id === userId;

        // Retornar informações completas
        res.json({ 
            tempoEstacionado: tempoFormatado,
            segundos: diffSegundos,
            entrada: entradaTime,
            timestamp: agoraTime,
            status: vaga.status,
            ocupada: true,
            isOcupante,
            usuario_id: vaga.usuario_id,
            serverTime: new Date().toISOString()
        });
        
    } catch (error) { 
        next(error); 
    }
};

// --- Função para liberar vaga pelo usuário ---
const liberarVaga = async (req, res, next) => {
    const { vagaId } = req.params;
    const userId = req.user.id;
    
    // Adicionar feedback de processamento imediato
    res.set('X-Processing', 'true');
    
    // Iniciar transação para garantir consistência
    const transaction = await db.sequelize.transaction();
    
    try {
        // Buscar vaga com bloqueio para evitar condições de corrida
        const vaga = await db.Vaga.findByPk(vagaId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        
        if (!vaga) {
            throw new NotFoundError("Vaga não encontrada.");
        }
        
        // Validar se a vaga está ocupada
        if (vaga.status !== 'ocupada') {
            throw new BadRequestError("A vaga não está ocupada.");
        }
        
        // Validar se o usuário é o ocupante da vaga
        if (vaga.usuario_id !== userId) {
            throw new AppError("Você não tem permissão para liberar esta vaga.", 403);
        }
        
        // Calcular tempo estacionado
        const agora = new Date();
        const entrada = new Date(vaga.entrada);
        const tempoEstacionadoMs = agora - entrada;
        const tempoEstacionadoSegundos = Math.floor(tempoEstacionadoMs / 1000);
        
        // Atualizar vaga para livre
        const vagaAtualizada = await vaga.update({
            status: 'livre',
            usuario_id: null,
            placa: null,
            entrada: null,
            saida: agora,
            tempo_estacionado: tempoEstacionadoSegundos,
            updated_at: agora
        }, { transaction });
        
        // Confirmar a transação
        await transaction.commit();
        
        // Dados para o socket
        const dadosSocket = {
            id: vagaAtualizada.id,
            status: 'livre',
            placa: null,
            entrada: null,
            usuario_id: null,
            tempo_estacionado: 0,
            numero: vagaAtualizada.numero
        };

        // Emitir eventos de socket
        socketService.emitVagaAtualizada(vagaAtualizada.estacionamento_id, vagaId, dadosSocket);
        socketService.emitEstadoVagasAtualizado(vagaAtualizada.estacionamento_id);
        
        // Notificar o usuário
        socketService.notificarUsuario(userId, 'vaga_liberada', {
            vagaId: vagaAtualizada.id,
            estacionamentoId: vagaAtualizada.estacionamento_id,
            numeroVaga: vagaAtualizada.numero,
            tempoEstacionado: tempoEstacionadoSegundos
        });
        
        logger.info(`Vaga ${vagaId} liberada pelo usuário ${userId}`);

        // Responder ao cliente
        return res.status(200).json({ 
            success: true,
            message: "Vaga liberada com sucesso!",
            vaga: {
                id: vagaAtualizada.id,
                status: 'livre',
                estacionamentoId: vagaAtualizada.estacionamento_id,
                numeroVaga: vagaAtualizada.numero,
                tempoEstacionado: tempoEstacionadoSegundos
            }
        });
        
    } catch (error) {
        if (error.message.includes("não pertence ao usuário")) {
            next(new AppError("Você não é o ocupante desta vaga.", 403)); // 403 Forbidden
        } else {
            next(error); // Passa outros erros para o handler
        }
    }
};

/**
 * Obtém os dados de pagamento PIX de um estacionamento
 * @param {Object} req - Objeto de requisição
 * @param {Object} res - Objeto de resposta
 * @param {Function} next - Próximo middleware
 */
const getPixPaymentDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const result = await db.sequelize.query(
            `SELECT id, nome, chave_pix, email 
             FROM estacionamentos 
             WHERE id = :id`,
            {
                replacements: { id },
                type: db.sequelize.QueryTypes.SELECT
            }
        );
        
        if (result.length === 0) {
            throw new NotFoundError('Estacionamento não encontrado');
        }
        
        const estacionamento = result[0];
        
        if (!estacionamento.chave_pix || !estacionamento.email) {
            throw new AppError('Estacionamento não configurado para receber pagamentos PIX', 400);
        }
        
        res.json({
            success: true,
            data: {
                estacionamentoId: estacionamento.id,
                nomeEstacionamento: estacionamento.nome,
                chavePix: estacionamento.chave_pix,
                email: estacionamento.email
            }
        });
        
    } catch (error) {
        next(error);
    }
};

module.exports = { 
    getAllEstacionamentos, 
    getEstacionamentoById, 
    getVagasByEstacionamentoId, 
    getPixPaymentDetails,
    getVagasLivresCount, 
    agendarVaga, 
    getTempoEstacionado, 
    liberarVaga
};