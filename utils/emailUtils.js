// utils/emailUtils.js
// Utilitário para envio de emails usando Nodemailer.

const nodemailer = require('nodemailer');
const config = require('../config'); // Importa configurações da aplicação
const logger = require('./logger'); // Importa o logger Winston

let transporter;
let isEmailConfigured = false; // Flag para verificar se a configuração está OK
let _isSmtpVerified = false; // Flag para verificar se a conexão SMTP funcionou

// Tenta criar o transportador na inicialização
try {
    // Verifica se as configurações essenciais existem
    if (config.email.host && config.email.auth.user && config.email.auth.pass) {
        transporter = nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port,
            secure: config.email.secure, // true para porta 465, false para outras (ex: 587 TLS)
            auth: {
                user: config.email.auth.user,
                pass: config.email.auth.pass,
            },
             // Em produção, pode ser necessário configurar TLS options adicionais
             // Ex: minVersion, ciphers
             tls: {
                 // Não rejeita certificados auto-assinados apenas se NÃO for produção
                 rejectUnauthorized: process.env.NODE_ENV === 'production'
             }
        });
        isEmailConfigured = true; // Marca como configurado inicialmente

        // Verifica a conexão SMTP de forma assíncrona (não bloqueia o start)
        transporter.verify()
            .then(() => {
                logger.info(`[Email] Conexão SMTP com ${config.email.host}:${config.email.port} verificada.`);
                _isSmtpVerified = true; // Marca como verificado
            })
            .catch(err => {
                logger.error(`[Email] FALHA ao verificar servidor SMTP (${config.email.host}). Emails podem não ser enviados.`);
                logger.error(`[Email] Erro SMTP Verify: ${err.message}`);
                isEmailConfigured = false; // Marca como não funcional se a verificação falhar
            });
    } else {
         logger.warn("[Email] Aviso: Configuração de email (EMAIL_HOST, EMAIL_USER, EMAIL_PASS) incompleta no .env. Emails desabilitados.");
    }
} catch (error) {
     logger.error('[Email] Falha CRÍTICA ao criar transportador Nodemailer:', error);
     isEmailConfigured = false;
}


/**
 * Envia um email usando o transportador configurado.
 * @param {object} mailOptions - Opções do email.
 * @param {string} mailOptions.to - Destinatário(s).
 * @param {string} mailOptions.subject - Assunto.
 * @param {string} mailOptions.text - Corpo em texto plano.
 * @param {string} [mailOptions.html] - Corpo em HTML (opcional).
 * @returns {Promise<boolean>} true se aceito pelo servidor SMTP, false caso contrário.
 */
const sendEmail = async ({ to, subject, text, html }) => {
    // Verifica se o email está configurado E se a conexão foi verificada (opcionalmente)
    if (!isEmailConfigured || !transporter /* || !isSmtpVerified */ ) {
        logger.error(`[Email] Tentativa de envio para ${to} falhou: Serviço de email não configurado ou falha na conexão inicial.`);
        // Retorna false para indicar falha no envio
        return false;
    }

    const mailData = {
        from: config.email.from, // Remetente da config
        to: to,
        subject: `[ParkNow] ${subject}`, // Adiciona prefixo padrão
        text: text,
        ...(html && { html: html }), // Adiciona HTML se fornecido
    };

    try {
        logger.info(`[Email] Enviando para: ${to} | Assunto: ${mailData.subject}`);
        // Envia o email
        const info = await transporter.sendMail(mailData);
        logger.info(`[Email] Email enviado para ${to}. Message ID: ${info.messageId}`);
        // Retorna true indicando que o email foi aceito pelo servidor SMTP
        return true;
    } catch (error) {
        logger.error(`[Email] Erro ao enviar email para ${to}:`, { code: error.code, message: error.message });
        // Retorna false indicando falha no envio
        return false;
    }
};

module.exports = {
    sendEmail,
    // Poderia exportar isEmailConfigured se outros módulos precisarem saber
};