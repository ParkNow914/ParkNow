const { setUserTimezone } = require('../utils/timezoneUtils');

/**
 * Middleware para detectar e definir o timezone do usuário
 * Obtém o timezone do cookie, cabeçalho ou usa o padrão
 */
function detectTimezone(req, res, next) {
    // Tenta obter o timezone na seguinte ordem:
    // 1. Do cookie (definido pelo frontend)
    // 2. Do cabeçalho X-Timezone (pode ser definido pelo frontend)
    // 3. Do parâmetro de query (para testes)
    // 4. Usa o padrão 'America/Sao_Paulo' como fallback
    const timezone = req.cookies.user_timezone ||
                   req.headers['x-timezone'] ||
                   req.query.timezone ||
                   'America/Sao_Paulo';

    // Define o timezone para esta requisição
    setUserTimezone(timezone);
    
    // Adiciona o timezone ao objeto de resposta para uso posterior
    res.locals.timezone = timezone;
    
    next();
}

module.exports = detectTimezone;
