const { setUserTimezone } = require('../utils/timezoneUtils');
const logger = require('../utils/logger');

/**
 * Atualiza o timezone do usuário
 * @route POST /api/timezone
 * @param {Object} req - Objeto de requisição
 * @param {Object} res - Objeto de resposta
 */
async function updateTimezone(req, res) {
    try {
        const { timezone } = req.body;
        
        if (!timezone) {
            return res.status(400).json({ 
                success: false, 
                message: 'Timezone é obrigatório' 
            });
        }

        // Define o timezone para o usuário atual
        setUserTimezone(timezone);
        
        // Define um cookie com o timezone do usuário (válido por 1 ano)
        const cookieOptions = { ...req.app.get('cookieOptions') };
        cookieOptions.maxAge = 365 * 24 * 60 * 60 * 1000; // 1 ano
        cookieOptions.path = '/'; // Garante que o cookie esteja disponível em todas as rotas
        
        res.cookie('user_timezone', timezone, cookieOptions);
        
        res.json({ 
            success: true, 
            message: 'Timezone atualizado com sucesso',
            timezone
        });
        
    } catch (error) {
        logger.error('Erro ao atualizar timezone:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao processar a requisição de timezone',
            error: error.message 
        });
    }
}

/**
 * Obtém o timezone atual do usuário
 * @route GET /api/timezone
 * @param {Object} req - Objeto de requisição
 * @param {Object} res - Objeto de resposta
 */
function getCurrentTimezone(req, res) {
    try {
        const timezone = req.cookies.user_timezone || 
                       req.headers['x-timezone'] || 
                       'America/Sao_Paulo';
        
        res.json({ 
            success: true, 
            timezone 
        });
        
    } catch (error) {
        logger.error('Erro ao obter timezone:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao obter timezone',
            error: error.message 
        });
    }
}

module.exports = {
    updateTimezone,
    getCurrentTimezone
};
