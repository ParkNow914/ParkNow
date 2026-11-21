// middleware/turnstile.js
// Verificação anti-robô com Cloudflare Turnstile (gratuito).
// Desligado enquanto TURNSTILE_SECRET_KEY não estiver definido, para não
// quebrar formulários que ainda não exibem o widget. Com a chave definida, o
// formulário precisa enviar o token do widget em `cf-turnstile-response`
// (campo padrão do widget) ou no header `CF-Turnstile-Response`.

const axios = require('axios');
const logger = require('../utils/logger');

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function verifyTurnstile() {
    return async (req, res, next) => {
        const secret = process.env.TURNSTILE_SECRET_KEY;
        if (!secret) return next();

        const token = req.body?.['cf-turnstile-response'] || req.get('CF-Turnstile-Response');
        if (!token) {
            return res.status(400).json({ success: false, message: 'Confirme que você não é um robô.' });
        }
        try {
            const params = new URLSearchParams({ secret, response: String(token) });
            if (req.ip) params.append('remoteip', req.ip);
            const { data } = await axios.post(VERIFY_URL, params, { timeout: 5000 });
            if (data && data.success) return next();
            logger.warn('[Turnstile] Verificação recusada', { codes: data && data['error-codes'] });
            return res.status(400).json({ success: false, message: 'Não foi possível confirmar que você não é um robô.' });
        } catch (err) {
            // Falha fechado: sem verificação, sem envio de e-mail.
            logger.error('[Turnstile] Erro ao verificar token', { error: err.message });
            return res.status(503).json({ success: false, message: 'Verificação anti-robô indisponível. Tente de novo.' });
        }
    };
}

module.exports = { verifyTurnstile };
