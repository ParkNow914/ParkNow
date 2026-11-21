// services/socketService.js
// Gerencia conexões e eventos WebSocket usando Socket.IO

const { Server } = require('socket.io');        // Importa classe Server do socket.io
const logger = require('../utils/logger');       // Logger Winston
const { logSafe } = require('../utils/logSafe');  // Neutraliza dado externo em logs
const config = require('../config');             // Configurações da aplicação
const jwtUtils = require('../utils/jwtUtils');   // Para autenticar conexão via JWT
const vagaModel = require('../models/vagaModel'); // Modelo de vagas para buscar estado
const userModel = require('../models/userModel'); // Para autenticação por handshake


let io; // Variável global para a instância do servidor Socket.IO

// --- Salas e privacidade ---
// `estacionamento_<id>`        : pública (qualquer usuário logado vendo o mapa)
// `admin_estacionamento_<id>`  : só o dono daquele estacionamento
// `admins_geral`               : só a equipe ParkNow (nivel_acesso = 'superadmin')
// `usuario_<id>`               : só o próprio motorista
const adminRoomFor = (estacionamentoId) => `admin_estacionamento_${estacionamentoId}`;
const SUPERADMIN_ROOM = 'admins_geral';

// Campos pessoais que nunca vão para a sala pública do estacionamento.
const CAMPO_PESSOAL = /placa|nome|email|cpf|telefone/i;

function semDadosPessoais(obj) {
    if (Array.isArray(obj)) return obj.map(semDadosPessoais);
    if (!obj || typeof obj !== 'object') return obj;
    const limpo = {};
    for (const [k, v] of Object.entries(obj)) {
        if (CAMPO_PESSOAL.test(k)) continue;
        limpo[k] = Array.isArray(v) ? v.map(semDadosPessoais) : v;
    }
    return limpo;
}

/** Coloca o socket de um admin nas salas dos estacionamentos dele. */
async function joinAdminRooms(socket) {
    const adminId = socket.decoded_token?.adminId;
    if (!adminId) return;
    const db = require('../config/database');
    const { rows: admins } = await db.query('SELECT nivel_acesso, status FROM admins WHERE id = $1', [adminId]);
    if (!admins.length || (admins[0].status && admins[0].status !== 'ativo')) {
        logger.warn(`[Socket.IO] Admin ${adminId} inexistente/inativo não entrou em salas.`);
        return;
    }
    if (admins[0].nivel_acesso === 'superadmin') socket.join(SUPERADMIN_ROOM);
    const { rows } = await db.query('SELECT id FROM estacionamentos WHERE admin_id = $1', [adminId]);
    for (const r of rows) socket.join(adminRoomFor(r.id));
    logger.info(`[Socket.IO] Admin ${adminId} entrou nas salas de ${rows.length} estacionamento(s).`);
}

/** Emite o dado completo para o dono e a versão sem dados pessoais para o público. */
function emitirParaEstacionamento(estacionamentoId, evento, dados) {
    if (!io || !estacionamentoId) return;
    io.to(adminRoomFor(estacionamentoId)).to(SUPERADMIN_ROOM).emit(evento, dados);
    io.to(`estacionamento_${estacionamentoId}`)
        .except(adminRoomFor(estacionamentoId))
        .emit(evento, semDadosPessoais(dados));
}

/**
 * Inicializa o servidor Socket.IO, anexa ao servidor HTTP e configura autenticação/eventos.
 * @param {http.Server} httpServer - A instância do servidor HTTP nativo do Node.js.
 * @returns {Server|null} A instância do servidor Socket.IO ou null se desabilitado/erro.
 */
const initSocketIO = (httpServer) => {
    // Verifica se o serviço está habilitado na configuração
    if (!config.realtime.enabled) {
        logger.warn('[Socket.IO] Serviço de tempo real desabilitado na configuração.');
        return null;
    }

    try {
        // Cria instância do Socket.IO Server
        io = new Server(httpServer, {
            cors: {
                origin: config.frontendUrl || "*", // Permite origem do frontend
                methods: ["GET", "POST"],
                credentials: true // Importante para futuras implementações com cookies
            },
            pingInterval: 10000, // Envia ping a cada 10s
            pingTimeout: 5000,   // Timeout de 5s sem resposta pong
            // Adiciona um parser customizado para lidar melhor com objetos Date (opcional)
            // parser: require("socket.io-msgpack-parser"), // Instalar 'socket.io-msgpack-parser' se usar
        });

        logger.info('[Socket.IO] Servidor inicializado. Aguardando conexões...');

        // --- Middleware de Autenticação Socket.IO ---
        io.use(async (socket, next) => {
            const token = socket.handshake.auth?.token; // Pega token da autenticação do handshake
            const clientIp = socket.handshake.address || 'IP Desconhecido';

            if (!token) {
                logger.warn(`[Socket.IO Auth] Conexão Rejeitada: Token Ausente. IP: ${clientIp}`);
                return next(new Error('Authentication error: No token'));
            }

            try {
                const decoded = jwtUtils.verifyAccessToken(token); // Verifica Access Token
                if (!decoded) {
                     logger.warn(`[Socket.IO Auth] Conexão Rejeitada: Token Inválido/Expirado. IP: ${clientIp}`);
                     return next(new Error('Authentication error: Invalid/Expired token'));
                }

                // Armazena dados decodificados no socket para uso posterior
                socket.decoded_token = decoded;
                logger.info(`[Socket.IO Auth] Cliente Autenticado: ${decoded.type} ID ${decoded.userId || decoded.adminId}. Socket: ${socket.id}, IP: ${clientIp}`);
                next(); // Permite conexão

            } catch (error) {
                 logger.error('[Socket.IO Auth] Erro inesperado na autenticação socket:', { 
            error: error.message, 
            stack: error.stack, 
            ip: clientIp, 
            token: token ? 'Token presente' : 'Token ausente'
        });
                next(new Error('Authentication error: Internal error'));
            }
        });


        // --- Lógica de Conexão e Eventos ---
        io.on('connection', (socket) => {
            const userInfo = `${socket.decoded_token?.type} ID ${socket.decoded_token?.userId || socket.decoded_token?.adminId}`;
            logger.info(`[Socket.IO] Cliente Conectado: ${socket.id} (${userInfo})`);

            // Salas definidas pelo SERVIDOR a partir do token, sem depender do
            // cliente pedir: o motorista recebe as notificações pessoais
            // (pagamento confirmado/rejeitado) mesmo que o frontend falhe.
            if (socket.decoded_token?.type === 'user' && socket.decoded_token.userId) {
                socket.join(`usuario_${socket.decoded_token.userId}`);
            } else if (socket.decoded_token?.type === 'admin' && socket.decoded_token.adminId) {
                joinAdminRooms(socket).catch((err) =>
                    logger.error('[Socket.IO] Falha ao colocar admin nas salas dos seus estacionamentos', { error: err.message })
                );
            }

            // --- Gerenciamento de Salas (Rooms) ---
            socket.on('join_estacionamento', (estacionamentoId) => {
                const estIdNum = parseInt(estacionamentoId);
                if (estIdNum > 0) {
                    const roomName = `estacionamento_${estIdNum}`;
                    socket.join(roomName);
                    logger.info(`[Socket.IO] Socket ${socket.id} (${userInfo}) entrou sala: ${roomName}`);
                    // Poderia enviar o estado atual das vagas SÓ para este socket ao entrar
                    // Ex: emitCurrentVagasState(estIdNum, socket);
                } else {
                     logger.warn(`[Socket.IO] Tentativa join inválida por ${socket.id}:`, estacionamentoId);
                }
            });

            socket.on('leave_estacionamento', (estacionamentoId) => {
                 const estIdNum = parseInt(estacionamentoId);
                 if (estIdNum > 0) {
                    const roomName = `estacionamento_${estIdNum}`;
                    socket.leave(roomName);
                    logger.info(`[Socket.IO] Socket ${socket.id} (${userInfo}) saiu sala: ${roomName}`);
                }
            });
            
            // Sala específica para usuários (para notificações pessoais)
            socket.on('join_usuario_room', (userId) => {
                if (socket.decoded_token?.type === 'user') {
                    // Verificar se o ID do usuário corresponde ao token
                    if (socket.decoded_token.userId == userId) {
                        const userRoom = `usuario_${userId}`;
                        socket.join(userRoom);
                        logger.info(`[Socket.IO] Socket ${socket.id} (User ID: ${userId}) entrou sala pessoal: ${userRoom}`);
                    } else {
                        logger.warn(`[Socket.IO] Tentativa de join em sala de outro usuário: ${socket.id} (${userInfo}) tentou entrar em sala do usuário ${userId}`);
                    }
                } else {
                    logger.warn(`[Socket.IO] Tentativa join sala usuário por não-usuário: ${socket.id}`);
                }
            });
            
            socket.on('leave_usuario_room', (userId) => {
                if (socket.decoded_token?.type === 'user' && socket.decoded_token.userId == userId) {
                    const userRoom = `usuario_${userId}`;
                    socket.leave(userRoom);
                    logger.info(`[Socket.IO] Socket ${socket.id} (User ID: ${userId}) saiu sala pessoal: ${userRoom}`);
                }
            });

            // Sala específica para Admins
            socket.on('join_admin_room', () => {
                if (socket.decoded_token?.type === 'admin') {
                    // Cada admin só entra nas salas dos PRÓPRIOS estacionamentos.
                    // A antiga sala única 'admins_geral' mandava reservas de
                    // todos os estacionamentos para todos os donos.
                    joinAdminRooms(socket).catch((err) =>
                        logger.error('[Socket.IO] Falha em join_admin_room', { error: err.message })
                    );
                } else {
                     logger.warn(`[Socket.IO] Tentativa join sala admin por não-admin: ${socket.id}`);
                }
            });


            // --- Tratamento Desconexão ---
            socket.on('disconnect', (reason) => {
                logger.info(`[Socket.IO] Cliente Desconectado: ${socket.id} (${userInfo}) | Razão: ${reason}`);
            });

            // --- Tratamento Erros Socket ---
            socket.on('error', (err) => {
                logger.error(`[Socket.IO] Erro no socket ${socket.id} (${userInfo}):`, err);
            });

            // --- Eventos CLIENTE -> SERVIDOR ---
            
            // Evento para solicitar estado atual das vagas
            socket.on('solicitar_estado_vagas', async (estacionamentoId) => {
                try {
                    const estId = parseInt(estacionamentoId);
                    if (estId > 0) {
                        const vagas = await vagaModel.findByEstacionamentoId(estId);
                        socket.emit('estado_vagas_atualizado', { estacionamentoId: estId, vagas });
                        logger.debug(`[Socket.IO] Enviado estado atual das vagas para ${socket.id} (${userInfo})`);
                    }
                } catch (error) {
                    logger.error(`[Socket.IO] Erro ao buscar estado das vagas:`, error);
                }
            });
            
            // Evento para solicitar tempo estacionado de uma vaga específica
            socket.on('solicitar_tempo_vaga', async (vagaId) => {
                try {
                    const vId = parseInt(vagaId);
                    if (vId > 0) {
                        const vaga = await vagaModel.findTempoEntradaById(vId);
                        if (vaga && vaga.status === 'ocupada') {
                            // Calcular tempo estacionado
                            const entradaTime = new Date(vaga.entrada).getTime();
                            const agoraTime = Date.now();
                            const diffMs = Math.max(0, agoraTime - entradaTime);
                            const diffSegundos = Math.floor(diffMs / 1000);
                            
                            // Verificar se o usuário atual é o ocupante
                            const isOcupante = vaga.usuario_id === socket.decoded_token.userId;
                            
                            socket.emit('tempo_vaga_atualizado', {
                                vagaId: vId,
                                entrada: entradaTime,
                                segundos: diffSegundos,
                                status: vaga.status,
                                usuario_id: vaga.usuario_id,
                                isOcupante
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`[Socket.IO] Erro ao buscar tempo da vaga:`, error);
                }
            });
            
            // Evento para sincronizar perfil do usuário
            socket.on('solicitar_perfil_usuario', async () => {
                try {
                    if (socket.decoded_token.type === 'user') {
                        const userId = socket.decoded_token.userId;
                        const user = await userModel.findById(userId);
                        if (user) {
                            // Remover dados sensíveis
                            delete user.senha;
                            delete user.reset_token;
                            socket.emit('perfil_usuario_atualizado', user);
                        }
                    }
                } catch (error) {
                    logger.error(`[Socket.IO] Erro ao buscar perfil do usuário:`, error);
                }
            });
        });

    } catch (error) {
        logger.error('[Socket.IO] Falha CRÍTICA ao inicializar Socket.IO Server:', error);
        io = null; // Garante null se falhar
    }

    return io; // Retorna a instância (ou null)
};

/**
 * Obtém a instância do servidor Socket.IO para emitir eventos.
 * Retorna um objeto mock se desabilitado/não inicializado para evitar erros.
 * @returns {Server|object} Instância Socket.IO ou mock.
 */
const getIO = () => {
    if (!io || !config.realtime.enabled) {
        // Mock para evitar erros em outras partes do código se socket estiver off
        return {
            emit: (ev, _data) => logger.debug(`[Socket.IO Mock] Emit global: '${ev}' (desabilitado)`),
            to: (room) => ({
                emit: (ev, _data) => logger.debug(`[Socket.IO Mock] Emit para sala '${room}': '${ev}' (desabilitado)`)
            })
        };
    }
    return io;
};

/**
 * Emite atualização de status de vaga para todos os clientes na sala do estacionamento
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {number} vagaId - ID da vaga
 * @param {object} vagaData - Dados atualizados da vaga
 */
const emitVagaAtualizada = (estacionamentoId, vagaId, vagaData) => {
    if (!io || !config.realtime.enabled) return;
    
    try {
        emitirParaEstacionamento(estacionamentoId, 'vaga_atualizada', { vagaId, ...vagaData });
        logger.debug(`[Socket.IO] Emitido 'vaga_atualizada' para estacionamento ${estacionamentoId}`);
    } catch (error) {
        logger.error(`[Socket.IO] Erro ao emitir atualização de vaga:`, error);
    }
};

/**
 * Emite atualização completa do estado das vagas para todos os clientes na sala do estacionamento
 * @param {number} estacionamentoId - ID do estacionamento
 * @param {Array} vagas - Lista de vagas atualizada
 */
const emitEstadoVagasAtualizado = async (estacionamentoId) => {
    if (!io || !config.realtime.enabled) return;
    
    try {
        const vagas = await require('../models/vagaModel').findByEstacionamentoId(estacionamentoId);
        emitirParaEstacionamento(estacionamentoId, 'estado_vagas_atualizado', { estacionamentoId, vagas });
        logger.debug(`[Socket.IO] Emitido 'estado_vagas_atualizado' para estacionamento ${estacionamentoId}`);
    } catch (error) {
        logger.error(`[Socket.IO] Erro ao emitir estado das vagas:`, error);
    }
};

/**
 * Notifica um usuário específico sobre uma atualização importante
 * @param {number} userId - ID do usuário
 * @param {string} tipo - Tipo de notificação
 * @param {object} dados - Dados da notificação
 */
const notificarUsuario = (userId, tipo, dados) => {
    if (!io || !config.realtime.enabled) return;
    
    try {
        // Encontrar todos os sockets deste usuário
        const sockets = Array.from(io.sockets.sockets.values())
            .filter(socket => 
                socket.decoded_token?.type === 'user' && 
                socket.decoded_token?.userId === userId
            );
        
        if (sockets.length > 0) {
            sockets.forEach(socket => {
                socket.emit('notificacao_usuario', { tipo, ...dados });
            });
            logger.debug(`[Socket.IO] Notificação '${tipo}' enviada para usuário ${userId} (${sockets.length} conexões)`);
        }
    } catch (error) {
        logger.error(`[Socket.IO] Erro ao notificar usuário:`, error);
    }
};

// --- Funções Utilitárias para Emitir Eventos ---

/**
 * Emite atualização de UMA vaga para a sala do estacionamento correspondente.
 * @param {number} estacionamentoId
 * @param {object} vagaData - Dados da vaga (id, status, placa, tempo_estacionado, etc.)
 */
const emitAtualizacaoVaga = (estacionamentoId, vagaData) => {
    const currentIo = getIO();
    if (!currentIo.emit) return; // Verifica se é o mock
    logger.info(`[Socket.IO Emit] 'vaga_update' para estacionamento ${Number(estacionamentoId)}: Vaga ID ${Number(vagaData.id)}, Status ${logSafe(vagaData.status)}`);
    emitirParaEstacionamento(estacionamentoId, 'vaga_update', vagaData);
    // Dispara atualização da contagem de livres também
    emitContagemVagasLivres(estacionamentoId);
};

/**
 * Busca e emite a contagem atualizada de vagas livres para a sala do estacionamento.
 * @param {number} estacionamentoId
 */
const emitContagemVagasLivres = async (estacionamentoId) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    const roomName = `estacionamento_${estacionamentoId}`;
    try {
        const vagaModel = require('../models/vagaModel'); // Import tardio
        const count = await vagaModel.countLivres(estacionamentoId);
        logger.info(`[Socket.IO Emit] 'vagas_livres_update' para ${roomName}: ${count} livres`);
        currentIo.to(roomName).emit('vagas_livres_update', { estacionamentoId, vagasLivres: count });
    } catch (error) {
        logger.error(`[Socket.IO] Erro ao emitir contagem vagas livres Est. ${estacionamentoId}:`, error);
    }
};

/**
 * Emite notificação de nova reserva para a sala geral de admins.
 * @param {object} reservaData - Dados da reserva criada.
 */
const emitNovaReserva = (reservaData) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    // Só o dono do estacionamento (e a equipe ParkNow) recebe a reserva.
    logger.info(`[Socket.IO Emit] 'nova_reserva' para admins do estacionamento ${reservaData.estacionamento_id}: Reserva ID ${reservaData.id}`);
    currentIo.to(adminRoomFor(reservaData.estacionamento_id)).to(SUPERADMIN_ROOM).emit('nova_reserva', reservaData);
};

// Opcional: Função para enviar o estado completo das vagas para um socket específico
// async function emitCurrentVagasState(estacionamentoId, targetSocket) {
//    if (!targetSocket || !config.realtime.enabled) return;
//    try {
//        const vagaModel = require('../models/vagaModel');
//        const vagas = await vagaModel.findByEstacionamentoId(estacionamentoId);
//        logger.info(`[Socket.IO Emit] Enviando estado inicial de vagas para ${targetSocket.id} (Est. ${estacionamentoId})`);
//        targetSocket.emit('vagas_estado_inicial', vagas);
//    } catch (error) {
//        logger.error(`[Socket.IO] Erro ao emitir estado inicial vagas Est. ${estacionamentoId} para ${targetSocket.id}:`, error);
//        targetSocket.emit('erro_estado_vagas', { message: 'Erro ao buscar estado atual das vagas.' });
//    }
// }


/**
 * Emite notificação de atualização de reserva para o usuário e para a sala de admins.
 * @param {object} reservaData - Dados da reserva atualizada.
 */
const emitAtualizacaoReserva = (reservaData) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    
    // Dono do estacionamento + equipe ParkNow. A reserva NÃO vai mais para a
    // sala pública do estacionamento nem para donos de outros estacionamentos.
    if (reservaData.estacionamento_id) {
        logger.info(`[Socket.IO Emit] 'atualizacao_reserva' para admins do estacionamento ${reservaData.estacionamento_id}: Reserva ID ${reservaData.id}`);
        currentIo.to(adminRoomFor(reservaData.estacionamento_id)).to(SUPERADMIN_ROOM).emit('atualizacao_reserva', reservaData);
    }

    // Emite para a sala do usuário se existir
    if (reservaData.usuario_id) {
        const userRoom = `usuario_${reservaData.usuario_id}`;
        currentIo.to(userRoom).emit('atualizacao_reserva', reservaData);
    }
};

/**
 * Emite um evento para todos os clientes conectados
 * @param {string} event - Nome do evento
 * @param {object} data - Dados do evento
 */
const emitToAll = (event, data) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    
    logger.info(`[Socket.IO Emit] '${event}' para todos os clientes conectados`);
    currentIo.emit(event, data);
};

/**
 * Emite um evento para uma sala específica
 * @param {string} room - Nome da sala
 * @param {string} event - Nome do evento
 * @param {object} data - Dados do evento
 */
const emitToRoom = (room, event, data) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    
    logger.info(`[Socket.IO Emit] '${event}' para sala ${room}`);
    currentIo.to(room).emit(event, data);
};

/**
 * Emite um evento para a sala de administradores
 * @param {string} event - Nome do evento
 * @param {object} data - Dados do evento
 */
const emitToAdmin = (event, data) => {
    const currentIo = getIO();
    if (!currentIo.emit) return;
    // Com estacionamento_id vai para o dono daquele estacionamento; sem ele,
    // só para a equipe ParkNow (nunca para todos os donos).
    if (data && data.estacionamento_id) {
        currentIo.to(adminRoomFor(data.estacionamento_id)).to(SUPERADMIN_ROOM).emit(event, data);
    } else {
        currentIo.to(SUPERADMIN_ROOM).emit(event, data);
    }
};

module.exports = {
    initSocketIO,
    getIO,
    emitToRoom,
    emitToAll,
    emitToAdmin,
    emitVagaAtualizada,
    emitEstadoVagasAtualizado,
    notificarUsuario,
    emitAtualizacaoVaga,
    emitContagemVagasLivres,
    emitNovaReserva,
    emitAtualizacaoReserva
};