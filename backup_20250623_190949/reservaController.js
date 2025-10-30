// controllers/reservaController.js
const reservaModel = require('../models/reservaModel');
const vagaModel = require('../models/vagaModel');
const userModel = require('../models/userModel');
const logger = require('../utils/logger');
const pool = require('../models/db');
const { AppError, NotFoundError, BadRequestError, AuthorizationError } = require('../utils/AppError');
const socketService = require('../services/socketService'); // Para emitir evento
const config = require('../config');

const criarReserva = async (req, res, next) => {
    const usuario_id = req.user.id;
    // Validação feita na rota
    const { vaga_id, estacionamento_id, horario_inicio_reserva, duracao_minutos } = req.body;
    
    logger.info('Iniciando criação de reserva', {
        usuario_id,
        vaga_id,
        estacionamento_id,
        horario_inicio_reserva,
        duracao_minutos,
        body: req.body
    });
    
    const client = await pool.connect();
    
    try {
        // Inicia transação
        await client.query('BEGIN');
        
        logger.info('Verificando se já existe reserva ativa para o usuário no estacionamento', {
            usuario_id,
            estacionamento_id
        });
        
        const reservaExistente = await reservaModel.findActiveReservaByUsuarioAndEstacionamento(usuario_id, estacionamento_id, client);
        if (reservaExistente) {
            logger.warn('Tentativa de criar reserva duplicada', {
                usuario_id,
                estacionamento_id,
                reserva_existente_id: reservaExistente.id,
                status: reservaExistente.status
            });
            throw new AppError(`Já existe uma reserva ativa para este estacionamento.`, 409);
        }
        
        const inicio = new Date(horario_inicio_reserva);
        const fim = new Date(inicio.getTime() + parseInt(duracao_minutos) * 60000);
        
        logger.info('Datas da reserva', {
            inicio: inicio.toISOString(),
            fim: fim.toISOString(),
            agora: new Date().toISOString()
        });
        
        if (inicio <= new Date(Date.now() + 60000)) {
            const erro = "Início deve ser pelo menos 1 min no futuro.";
            logger.warn(erro, { inicio, agora: new Date() });
            throw new BadRequestError(erro);
        }

        // Verifica disponibilidade usando a função aprimorada do model
        logger.info('Verificando disponibilidade da vaga', { vaga_id, inicio, fim });
        const isAvailable = await reservaModel.isVagaAvailableForPeriod(vaga_id, inicio, fim, client);
        logger.info('Resultado da verificação de disponibilidade', { isAvailable });
        
        if (!isAvailable) {
            const erro = `Vaga ${vaga_id} não disponível no período.`;
            logger.warn(erro, { vaga_id, inicio, fim });
            throw new AppError(erro, 409);
        }

        logger.info('Buscando dados do usuário', { usuario_id });
        const usuario = await userModel.findUserById(usuario_id);
        if (!usuario?.placa_veiculo) {
            const erro = "Placa não encontrada para o usuário.";
            logger.error(erro, { usuario_id, usuario });
            throw new BadRequestError(erro);
        }

        const reservaData = { 
            usuario_id, 
            vaga_id, 
            estacionamento_id, 
            placa_veiculo: usuario.placa_veiculo, 
            horario_inicio_reserva: inicio, 
            horario_fim_reserva: fim,
            status: 'confirmada' // Reserva confirmada diretamente sem pagamento
        };
        
        logger.info('Dados da reserva a ser criada', { reservaData });
        
        // Cria a reserva no banco de dados
        const reserva = await reservaModel.createReserva(reservaData, client);
        
        if (!reserva || !reserva.id) {
            const erro = 'Falha ao criar reserva - Nenhum ID retornado';
            logger.error(erro, { reserva });
            throw new AppError(erro, 500);
        }
        
        const reservaId = reserva.id;
        logger.info('Reserva criada com sucesso', { reservaId, status: reserva.status });

        // Marca vaga como reservada usando a CONEXÃO DA TRANSAÇÃO
        logger.info('Tentando reservar a vaga', { vaga_id, reservaId });
        const reservouVaga = await vagaModel.reservarVaga(vaga_id, reservaId, client);
        
        if (!reservouVaga) {
            const erro = `Não foi possível reservar a vaga ${vaga_id} (ocupada/reservada?).`;
            logger.error(erro, { vaga_id, reservaId });
            throw new AppError(erro, 409);
        }
        
        logger.info('Vaga reservada com sucesso', { vaga_id, reservaId });

        // Commit da transação
        logger.info('Efetuando commit da transação');
        await client.query('COMMIT');
        logger.info('Transação confirmada com sucesso');

<<<<<<< Updated upstream
        // Emite evento de nova reserva via WebSocket
        logger.info('Enviando notificação WebSocket para o usuário', { usuario_id, reservaId });
        try {
            await socketService.notificarUsuario(usuario_id, 'reserva:criada', { 
                reservaId,
                status: 'confirmada', 
                message: 'Reserva criada com sucesso!'
            });
            logger.info('Notificação WebSocket enviada com sucesso', { usuario_id, reservaId });
        } catch (wsError) {
            logger.error('Erro ao enviar notificação WebSocket', {
                error: wsError.message,
                stack: wsError.stack,
                usuario_id,
                reservaId
            });
            // Não interrompe o fluxo em caso de falha no WebSocket
        }
=======
        // Notifica o usuário sobre a nova reserva via WebSocket
        socketService.notificarUsuario(usuario_id, 'reserva:criada', { 
            reservaId,
            status: 'confirmada', 
            message: 'Reserva criada com sucesso!'
        });
>>>>>>> Stashed changes

        const resposta = {
            success: true,
            message: 'Reserva criada com sucesso!',
            data: {
                reservaId,
                status: 'confirmada'
            }
        };
        
        logger.info('Enviando resposta de sucesso para o cliente', { 
            statusCode: 201,
            resposta 
        });
        
        return res.status(201).json(resposta);
    } catch (error) {
        // Log detalhado do erro
        const errorContext = {
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack
            },
            request: {
                method: req.method,
                url: req.originalUrl,
                params: req.params,
                query: req.query,
                body: req.body,
                user: req.user ? { id: req.user.id, email: req.user.email } : null
            },
            timestamp: new Date().toISOString()
        };
        
        // Log de erro completo
        logger.error('ERRO ao processar criação de reserva', errorContext);
        
        // Log amigável para o desenvolvedor
        console.error('\n=== ERRO NA CRIAÇÃO DE RESERVA ===');
        console.error(`Mensagem: ${error.message}`);
        console.error(`Tipo: ${error.name}`);
        console.error(`Usuário: ${req.user?.id || 'N/A'}`);
        console.error(`Endpoint: ${req.method} ${req.originalUrl}`);
        console.error('Stack:', error.stack.split('\n')[0]);
        console.error('===============================\n');
        
        // Rollback da transação em caso de erro
        try {
            if (client) {
                logger.info('Tentando fazer rollback da transação');
                await client.query('ROLLBACK');
                logger.info('Rollback realizado com sucesso');
            }
        } catch (rollbackError) {
            logger.error('ERRO durante rollback da transação', {
                error: rollbackError.message,
                stack: rollbackError.stack,
                originalError: error.message
            });
            // Não sobrescreve o erro original
        }
        
        // Encaminha o erro para o middleware de tratamento de erros
        next(error);
    } finally {
        // Libera o cliente de volta para o pool
        if (client) {
            try {
                client.release();
                logger.debug('Conexão com o banco de dados liberada');
            } catch (releaseError) {
                logger.error('Erro ao liberar conexão com o banco de dados', {
                    error: releaseError.message,
                    stack: releaseError.stack
                });
            }
        }
    }
};

/**
 * @swagger
 * /api/reservas/minhas:
 *   get:
 *     summary: Lista as reservas do usuário autenticado
 *     tags: [Reservas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número da página para paginação
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Número de itens por página (máx 50)
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [data_reserva, data_inicio, data_fim, valor_total]
 *           default: data_reserva
 *         description: Campo para ordenação
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Direção da ordenação (ASC ou DESC)
 *     responses:
 *       200:
 *         description: Lista de reservas do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reserva'
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 *       500:
 *         $ref: '#/components/responses/ErroServidor'
 */
const listarMinhasReservas = async (req, res, next) => {
    try {
        // Log de informações do usuário e cabeçalhos
        console.log('[Reservas] Headers recebidos:', req.headers);
        console.log('[Reservas] Usuário autenticado:', {
            id: req.user?.id,
            email: req.user?.email,
            tipo: req.user?.tipo
        });

        const userId = req.user.id;
        logger.info('Buscando reservas para o usuário:', { 
            userId,
            query: req.query,
            params: req.params
        });
        
        const { 
            page = 1, 
            limit = 10, 
            orderBy = 'data_reserva',
            order = 'DESC' 
        } = req.query;

        // Validação dos parâmetros
        const pageNumber = Math.max(1, parseInt(page, 10)) || 1;
        const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10))) || 10;
        const offset = (pageNumber - 1) * limitNumber;

<<<<<<< Updated upstream
        // Log dos parâmetros de busca
        logger.info('Buscando reservas para usuário', {
            userId: req.user.id,
            page: pageNumber,
=======
        logger.debug('Parâmetros processados:', {
            userId,
            pageNumber,
            limitNumber,
            offset,
            orderBy,
            order,
            query: req.query
        });

        console.log(`[Reservas] Buscando reservas para usuário ${userId} com parâmetros:`, {
>>>>>>> Stashed changes
            limit: limitNumber,
            offset,
            orderBy,
            order: order.toUpperCase()
        });

        // Busca as reservas com paginação
        let status = req.query.status; // Pode ser 'ativa', 'cancelada', 'concluida', etc.
        
        // Se não foi especificado um status, filtra para mostrar apenas ativas/confirmadas por padrão
        if (!status) {
            status = 'ativa,confirmada';
        }
        
        // Converte para array de status se for string com vírgulas
        const statusArray = typeof status === 'string' 
            ? status.split(',').map(s => s.trim().toLowerCase())
            : [status];
        
        const reservas = await reservaModel.findReservasByUsuario(
            userId, 
            { 
                limit: limitNumber, 
                offset,
                orderBy,
                order: order.toUpperCase(),
                status: statusArray
            }
        );
        
        // Já filtrado na query, mas garantindo que está tudo certo
        const reservasFiltradas = Array.isArray(reservas) ? reservas : [];

        // Log detalhado das reservas encontradas
        logger.info('Reservas encontradas - Detalhado', {
            userId: req.user.id,
            count: reservas ? reservas.length : 0,
            reservas: reservas ? reservas.map(r => ({
                id: r.id,
                status: r.status,
                data_reserva: r.data_reserva,
                data_entrada_prevista: r.data_entrada_prevista,
                data_saida_prevista: r.data_saida_prevista,
                estacionamento_nome: r.estacionamento_nome,
                endereco_estacionamento: r.estacionamento_endereco,
                vaga_numero: r.vaga_numero,
                placa_veiculo: r.placa_veiculo,
                // Adicionando todos os campos retornados para depuração
                campos_retornados: Object.keys(r).join(', ')
            })) : []
        });
        
        // Log da estrutura completa da primeira reserva (se houver)
        if (reservas && reservas.length > 0) {
            logger.info('Estrutura completa da primeira reserva:', JSON.stringify(reservas[0], null, 2));
        }

        console.log(`[Reservas] Total de reservas encontradas: ${reservas.length} para usuário ${userId}`);
        
        // Conta o total de reservas para a paginação
        const total = await reservaModel.countReservasByUsuario(userId);
        const totalPages = Math.ceil(total / limitNumber);
        
        logger.info('Total de reservas encontradas', {
            userId: req.user.id,
            total,
            totalPages
        });

        console.log('[Reservas] Estatísticas de paginação:', { 
            total, 
            totalPages,
            currentPage: pageNumber,
            limit: limitNumber
        });

        // Log detalhado das reservas encontradas
        if (reservas.length > 0) {
            console.log('[Reservas] Detalhes das reservas encontradas:');
            reservas.forEach((r, index) => {
                console.log(`[Reserva ${index + 1}]`, {
                    id: r.id,
                    status: r.status,
                    data_entrada_prevista: r.data_entrada_prevista,
                    data_saida_prevista: r.data_saida_prevista,
                    horario_inicio_reserva: r.horario_inicio_reserva,
                    horario_fim_reserva: r.horario_fim_reserva,
                    vaga_id: r.vaga_id,
                    vaga_numero: r.vaga_numero,
                    estacionamento_id: r.estacionamento_id,
                    estacionamento_nome: r.estacionamento_nome,
                    created_at: r.created_at,
                    updated_at: r.updated_at
                });
            });
        } else {
            console.log(`[Reservas] Nenhuma reserva encontrada para o usuário ${userId}`);
            // Verifica se o usuário existe
            try {
                const user = await pool.query('SELECT id, email, nome FROM usuarios WHERE id = $1', [userId]);
                if (user.rows.length === 0) {
                    console.error(`[Reservas] ATENÇÃO: Usuário com ID ${userId} não encontrado na base de dados!`);
                } else {
                    console.log(`[Reservas] Usuário encontrado:`, user.rows[0]);
                }
            } catch (userError) {
                console.error('[Reservas] Erro ao verificar usuário:', userError);
            }
        }

        res.json({
<<<<<<< Updated upstream
            data: reservasFiltradas,
=======
            success: true,
            data: reservas,
>>>>>>> Stashed changes
            pagination: {
                total,
                totalPages,
                currentPage: pageNumber,
                hasNextPage: pageNumber < totalPages,
                hasPreviousPage: pageNumber > 1,
                limit: limitNumber
            }
        });
    } catch (error) {
        logger.error('Erro ao listar reservas do usuário:', {
            userId: req.user?.id,
            error: error.message,
            stack: error.stack
        });
        next(error);
    }
};

const cancelarMinhaReserva = async (req, res, next) => {
    const usuario_id = req.user.id; const { reservaId } = req.params; // Validado na rota
    const client = await pool.connect();
    try {
        // Inicia transação
        await client.query('BEGIN');
        const reserva = await reservaModel.findReservaById(reservaId, client); // Usa client
        if (!reserva) throw new NotFoundError("Reserva não encontrada.");
        if (reserva.usuario_id !== usuario_id) throw new AuthorizationError("Você não pode cancelar esta reserva.");
        if (reserva.status !== 'ativa' && reserva.status !== 'confirmada') {
            throw new BadRequestError(`Não é possível cancelar uma reserva ${reserva.status || 'com status inválido'}. Apenas reservas ativas ou confirmadas podem ser canceladas.`);
        }

        // Atualiza status da reserva para cancelada e libera a vaga na mesma transação
        await reservaModel.atualizarStatus(reservaId, 'cancelada', client);
        const sqlLiberaVaga = `
            UPDATE vagas 
            SET status = 'livre', 
                reserva_id_ativa = NULL 
            WHERE id = $1 AND (reserva_id_ativa = $2 OR reserva_id_ativa IS NULL)`;
        const { rowCount } = await client.query(sqlLiberaVaga, [reserva.vaga_id, reservaId]);
        if (rowCount === 0) logger.warn(`[Cancelar Reserva] Vaga ${reserva.vaga_id} não estava marcada como reservada para ${reservaId}.`);

        // Commita a transação
        await client.query('COMMIT');

        // Emite atualização da vaga após commit
        const vagaLiberada = await vagaModel.findById(reserva.vaga_id, client);
        if(vagaLiberada) socketService.emitAtualizacaoVaga(reserva.estacionamento_id, vagaLiberada);

        logger.info(`Reserva ${reservaId} cancelada U:${usuario_id}`);
        res.json({ status: 'success', message: 'Reserva cancelada.' });
    } catch (error) {
        // Rollback da transação em caso de erro
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

// Obter detalhes de uma reserva específica pelo ID
const obterReservaPorId = async (req, res, next) => {
    const usuario_id = req.user.id;
    const { reservaId } = req.params; // Validado na rota
    
    const client = await pool.connect();
    try {
        // Buscar a reserva
        const reserva = await reservaModel.findReservaById(reservaId, client);
        
        // Verificar se a reserva existe
        if (!reserva) {
            throw new NotFoundError("Reserva não encontrada.");
        }
        
        // Verificar se a reserva pertence ao usuário logado
        if (reserva.usuario_id !== usuario_id) {
            throw new AuthorizationError("Você não tem permissão para acessar esta reserva.");
        }
        
        // Retornar os detalhes da reserva
        res.json(reserva);
    } catch (error) {
        next(error);
    } finally {
        client.release();
    }
};

// Estender a duração de uma reserva ativa
const estenderReserva = async (req, res, next) => {
    const usuario_id = req.user.id;
    const { reservaId } = req.params; // Validado na rota
    const { duracao_adicional_minutos } = req.body; // Validado na rota
    
    const client = await pool.connect();
    
    try {
        // Inicia transação
        await client.query('BEGIN');
        
        // Buscar a reserva
        const reserva = await reservaModel.findReservaById(reservaId, client);
        
        // Verificar se a reserva existe
        if (!reserva) {
            throw new NotFoundError("Reserva não encontrada.");
        }
        
        // Verificar se a reserva pertence ao usuário logado
        if (reserva.usuario_id !== usuario_id) {
            throw new AuthorizationError("Você não tem permissão para estender esta reserva.");
        }
        
        // Verificar se a reserva está em um estado que pode ser estendida
        if (reserva.status !== 'ativa' && reserva.status !== 'confirmada') {
            throw new BadRequestError(`Não é possível estender uma reserva ${reserva.status || 'com status inválido'}. Apenas reservas ativas ou confirmadas podem ser estendidas.`);
        }
        
        // Calcular o novo horário de término usando data_saida_prevista
        const horarioFimAtual = new Date(reserva.data_saida_prevista);
        if (isNaN(horarioFimAtual.getTime())) {
            throw new BadRequestError('Data de término da reserva inválida.');
        }
        const novoHorarioFim = new Date(horarioFimAtual.getTime() + duracao_adicional_minutos * 60000);
        
        // Verificar se o novo horário de término não conflita com outras reservas
        const isAvailable = await reservaModel.isVagaAvailableForExtension(
            reserva.vaga_id,
            horarioFimAtual,
            novoHorarioFim,
            reservaId,
            client
        );
        
        if (!isAvailable) {
            throw new AppError("Não é possível estender a reserva. Conflito com outra reserva.", 409);
        }
        
        // Atualizar o horário de término da reserva
        const sql = `UPDATE reservas SET data_saida_prevista = $1 WHERE id = $2`;
        const novoHorarioFimSql = novoHorarioFim.toISOString().slice(0, 19).replace('T', ' ');
        await client.query(sql, [novoHorarioFimSql, reservaId]);
        
        // Commita a transação
        await client.query('COMMIT');
        
        // Buscar a reserva atualizada para retornar
        const reservaAtualizada = await reservaModel.findReservaById(reservaId, client);
        
        // Emitir evento de atualização se necessário
        socketService.emitAtualizacaoReserva(reservaAtualizada);
        
        logger.info(`Reserva ${reservaId} estendida por ${duracao_adicional_minutos} minutos. U:${usuario_id}`);
        res.json({ status: 'success', message: 'Reserva estendida com sucesso.', reserva: reservaAtualizada });
    } catch (error) {
        // Rollback da transação em caso de erro
        await client.query('ROLLBACK');
        next(error);
    } finally {
        client.release();
    }
};

module.exports = { 
    criarReserva, 
    listarMinhasReservas, 
    cancelarMinhaReserva,
    obterReservaPorId,
    estenderReserva
};