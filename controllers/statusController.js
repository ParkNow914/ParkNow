// Controlador para verificar o status do servidor e suas conexões
const pool = require('../models/db');
const logger = require('../utils/logger');
const socketService = require('../services/socketService');
const os = require('os');

/**
 * Verifica o status do servidor e suas conexões
 * @param {Request} req - Requisição Express
 * @param {Response} res - Resposta Express
 * @param {NextFunction} next - Função next do Express
 */
const getServerStatus = async (req, res, next) => {
    try {
        // Verificar status do banco de dados
        let dbStatus = 'offline';
        try {
            const [result] = await pool.execute('SELECT 1 as connected');
            dbStatus = result[0].connected === 1 ? 'online' : 'error';
        } catch (dbError) {
            logger.error('Erro ao verificar conexão com o banco de dados:', dbError);
        }

        // Status do armazenamento temporário em memória
        const tempStorageStatus = 'online'; // Sempre online já que é em memória

        // Verificar status do Socket.IO
        let socketStatus = 'offline';
        try {
            const io = socketService.getIO();
            socketStatus = io ? 'online' : 'offline';
        } catch (socketError) {
            logger.error('Erro ao verificar status do Socket.IO:', socketError);
        }

        // Informações do sistema
        const systemInfo = {
            uptime: Math.floor(process.uptime()),
            memory: {
                total: Math.round(os.totalmem() / (1024 * 1024)),
                free: Math.round(os.freemem() / (1024 * 1024)),
                used: Math.round((os.totalmem() - os.freemem()) / (1024 * 1024))
            },
            cpu: os.cpus().length,
            hostname: os.hostname(),
            platform: os.platform(),
            nodeVersion: process.version
        };

        // Responder com o status
        res.json({
            status: 'online',
            timestamp: new Date().toISOString(),
            connections: {
                database: dbStatus,
                tempStorage: tempStorageStatus,
                socketIO: socketStatus,
                environment: process.env.NODE_ENV || 'development'
            },
            system: systemInfo
        });
    } catch (error) {
        logger.error('Erro ao verificar status do servidor:', error);
        next(error);
    }
};

/**
 * Verifica o status da conexão do usuário atual com o Socket.IO
 * @param {Request} req - Requisição Express
 * @param {Response} res - Resposta Express
 * @param {NextFunction} next - Função next do Express
 */
const getUserConnectionStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Verificar se o usuário está conectado via Socket.IO
        let socketConnected = false;
        let socketCount = 0;
        
        try {
            const io = socketService.getIO();
            if (io) {
                // Encontrar todos os sockets deste usuário
                const sockets = Array.from(io.sockets.sockets.values())
                    .filter(socket => 
                        socket.decoded_token?.type === 'user' && 
                        socket.decoded_token?.userId === userId
                    );
                
                socketConnected = sockets.length > 0;
                socketCount = sockets.length;
            }
        } catch (socketError) {
            logger.error(`Erro ao verificar conexão do usuário ${userId} com Socket.IO:`, socketError);
        }
        
        // Responder com o status
        res.json({
            userId,
            socketConnected,
            socketCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao verificar status da conexão do usuário:', error);
        next(error);
    }
};

module.exports = {
    getServerStatus,
    getUserConnectionStatus
};
