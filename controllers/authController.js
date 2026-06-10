// controllers/authController.js
// Lida com a lógica de registro, login, refresh, logout e reset de senha.

// Models
const userModel = require('../models/userModel');
const adminModel = require('../models/adminModel');
const _estacionamentoModel = require('../models/estacionamentoModel');
const _vagaModel = require('../models/vagaModel');
const _logModel = require('../models/logModel'); // Adicionando o modelo de log faltante
// Utils
const passwordUtils = require('../utils/passwordUtils');
const jwtUtils = require('../utils/jwtUtils');
const tokenUtils = require('../utils/tokenUtils'); // Para reset
const emailUtils = require('../utils/emailUtils'); // Para reset
const { checkPasswordStrength } = require('../utils/zxcvbnUtil');
const { AppError, AuthenticationError, BadRequestError, AuthorizationError: _AuthorizationError, ValidationError: _ValidationError, ConflictError } = require('../utils/AppError'); // Erros customizados
const bcrypt = require('bcrypt');
const logger = require('../utils/logger'); // Logger Winston
const config = require('../config');
const _pool = require('../models/db'); // Para transação no registerAdmin
const _fs = require('fs'); // Adicionando o módulo fs que faltava
const jwt = require('jsonwebtoken'); // Necessário para jwt.decode() fallback em logout
const _db = require('../config/db'); // Para queries diretas
// Import desabilitado pois Redis foi removido


const BCRYPT_SALT_ROUNDS = 10; // Custo para hash do refresh token
// Opções base para cookie, maxAge será adicionado dinamicamente
const _refreshTokenCookieOptions = { ...config.cookieProps };
const clearTokenCookieOptions = { ...config.cookieProps }; // Opções para limpar

// --- Helpers ---
const handleRegisterError = (error, next, accountType = 'Usuário') => {
    logger.error(`Erro no registro de ${accountType}:`, error);
    if (error.code === 'ER_DUP_ENTRY') {
        let field = 'Email ou CPF';
        if (accountType === 'Admin') field = 'Email';
        if (error.message.includes("'usuarios.email'")) field = 'Email';
        if (error.message.includes("'usuarios.cpf'")) field = 'CPF';
        if (error.message.includes("'admins.email'")) field = 'Email';
        // Usa ConflictError (409)
        next(new ConflictError(`${field} já cadastrado.`));
    } else {
        // Passa outros erros para o handler geral (que definirá 500)
        next(error);
    }
};

// Função para setar cookie com refresh token
const setRefreshTokenCookie = (res, refreshToken) => {
    const cookieOptions = res.app.get('cookieOptions');
    res.cookie('refreshToken', refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias em milissegundos
    });
};

// --- Usuário ---
const registerUser = async (req, res, next) => {
    // Validação foi feita pela rota usando express-validator
    const { nome, email, senha, telefone, tipo_veiculo, placa_veiculo, cpf } = req.body;
    try {
        const ps = checkPasswordStrength(senha, [nome, email]);
        if (ps.score < 2) { // Pontuação mínima 2 (razoável)
             return next(new BadRequestError(`Senha muito fraca (score: ${ps.score}/4). ${ps.feedback.warning || ''}`, { suggestions: ps.feedback.suggestions || [] }));
        }
        // Verifica email existente em usuarios (busca interna que pega qualquer status)
        if (await userModel.findUserByEmailInternal(email)) {
            return next(new ConflictError("Este email já está cadastrado como usuário."));
        }
        // Verifica se email já existe como admin
        if (await adminModel.findAdminByEmail(email)) {
            return next(new ConflictError("Este email já está cadastrado como administrador."));
        }

        const senhaHash = await passwordUtils.hashPassword(senha);
        const userId = await userModel.createUser({ nome, email, senhaHash, telefone, tipo_veiculo, placa_veiculo: placa_veiculo.toUpperCase(), cpf: cpf || null });

        // Gera token de verificação de email (válido por 24h) e envia link.
        try {
            const verifyToken = tokenUtils.generateSecureToken();
            const hashedVerify = tokenUtils.hashToken(verifyToken);
            const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await userModel.saveEmailVerificationToken(userId, hashedVerify, verifyExpires);

            const verifyUrl = `${config.frontendUrl}/api/auth/verify-email/${verifyToken}`;
            await emailUtils.sendEmail({
                to: email,
                subject: 'Bem-vindo ao ParkNow — confirme seu email',
                text: `Olá ${nome},\n\nSua conta ParkNow foi criada! Confirme seu email (válido por 24h):\n${verifyUrl}\n\nSe não foi você, ignore.`,
                html: `<p>Olá ${nome},</p><p>Sua conta ParkNow foi criada com sucesso!</p>
                       <p>Confirme seu email clicando <a href="${verifyUrl}" target="_blank">aqui</a> (link válido por 24 horas).</p>
                       <p>Se não foi você, ignore este email.</p>`,
            });
        } catch (e) {
            logger.error('Falha ao enviar email de verificação (cadastro segue válido):', { email, error: e.message });
        }

        logger.info(`Usuário registrado: ${email} (ID: ${userId})`);
        res.status(201).json({
            status: 'success',
            message: 'Cadastro realizado! Enviamos um link de confirmação para o seu email. Você já pode fazer login.',
        });
    } catch (error) {
        handleRegisterError(error, next, 'Usuário'); // Usa helper para tratar erro
    }
};

const loginUser = async (req, res, next) => {
    const { email, senha } = req.body; // Validados na rota
    try {
        const user = await userModel.findUserByEmail(email); // Busca usuário ATIVO
        if (!user || !(await passwordUtils.comparePassword(user.senha, senha))) {
            logger.warn(`[Auth] Falha login User: ${email}. IP: ${req.ip}`);
            throw new AuthenticationError("Usuário ou senha inválidos!");
        }
        // Status 'ativo' já verificado na query findUserByEmail

        const payload = { userId: user.id, type: 'user' };
        const accessToken = jwtUtils.generateAccessToken(payload);
        const refreshToken = jwtUtils.generateRefreshToken(payload);
        const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS); // Hash do refresh
        await userModel.saveRefreshTokenHash(user.id, refreshTokenHash); // Salva hash no DB

        setRefreshTokenCookie(res, refreshToken); // Seta o cookie httpOnly
        delete user.senha; delete user.refresh_token_hash; delete user.reset_token; delete user.reset_token_expires; // Limpa dados sensíveis
        logger.info(`Usuário logado: ${email} (ID: ${user.id}). IP: ${req.ip}`);
        res.json({ status: "success", message: "Login realizado!", accessToken, user }); // Envia Access Token
    } catch (error) {
        next(error); // Passa para o errorHandler
    }
};

const refreshToken = async (req, res, next) => {
    // Log de diagnóstico para verificar todos os cookies recebidos
    logger.debug(`[Auth] Refresh Token Request - Cookies recebidos: ${JSON.stringify(req.cookies || {})}. IP: ${req.ip}`);
    
    const requestRefreshToken = req.cookies?.refreshToken; // Lê do Cookie httpOnly
    if (!requestRefreshToken) {
        logger.warn(`[Auth] Refresh token não encontrado nos cookies. IP: ${req.ip}`);
        return next(new AuthenticationError('Refresh token não encontrado. Faça login novamente.'));
    }
    
    try {
        // Log do token para diagnóstico (apenas em ambiente de desenvolvimento)
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`[Auth] Processando refresh token: ${requestRefreshToken.substring(0, 20)}... IP: ${req.ip}`);
        }
        
        const decoded = jwtUtils.verifyRefreshToken(requestRefreshToken); // Verifica assinatura/expiração JWT
        if (!decoded) {
            logger.warn(`[Auth] Refresh token inválido (JWT). IP: ${req.ip}`);
            return next(new AuthenticationError('Refresh token inválido ou expirado (JWT).'));
        }
        
        logger.debug(`[Auth] Token JWT válido. Tipo: ${decoded.type}, ID: ${decoded.userId || decoded.adminId}. IP: ${req.ip}`);

        // REMOVIDO: Checagem de blacklist (Redis desabilitado)
        // if (decoded.jti && isRedisAvailable() && await isTokenBlacklisted(decoded.jti)) { ... }

        let isValidInDb = false; let payload = {};
        // Verifica hash no DB correto
        if (decoded.type === 'user' && decoded.userId) {
            isValidInDb = await userModel.verifyRefreshTokenHash(decoded.userId, requestRefreshToken); // Usa bcrypt.compare
            if (isValidInDb) {
                payload = { userId: decoded.userId, type: 'user' };
                logger.debug(`[Auth] Refresh token validado no DB para usuário ID: ${decoded.userId}. IP: ${req.ip}`);
            }
        } else if (decoded.type === 'admin' && decoded.adminId) {
            isValidInDb = await adminModel.verifyAdminRefreshTokenHash(decoded.adminId, requestRefreshToken); // Usa bcrypt.compare
            if (isValidInDb) {
                payload = { adminId: decoded.adminId, type: 'admin' };
                logger.debug(`[Auth] Refresh token validado no DB para admin ID: ${decoded.adminId}. IP: ${req.ip}`);
            }
        }

        // Se o hash no DB não bate (ou foi limpo no logout/reset), o token não é mais válido
        if (!isValidInDb) {
            logger.warn(`[Auth] Refresh token inválido/revogado no DB. User/Admin ID: ${decoded.userId || decoded.adminId}. IP: ${req.ip}`);
            res.clearCookie('refreshToken', clearTokenCookieOptions); // Limpa cookie inválido
            return next(new AuthenticationError('Sessão inválida ou revogada. Faça login novamente.'));
        }

        // Gera novo Access Token
        const newAccessToken = jwtUtils.generateAccessToken(payload);
        
        // Gera também um novo refresh token para implementar rotação de tokens (mais seguro)
        const newRefreshToken = jwtUtils.generateRefreshToken(payload);
        
        // Salva o novo hash do refresh token no banco de dados
        const refreshTokenHash = await bcrypt.hash(newRefreshToken, BCRYPT_SALT_ROUNDS);
        
        if (payload.type === 'user') {
            await userModel.saveRefreshTokenHash(payload.userId, refreshTokenHash);
        } else if (payload.type === 'admin') {
            await adminModel.saveAdminRefreshTokenHash(payload.adminId, refreshTokenHash);
        }
        
        // Define o novo refresh token como cookie
        setRefreshTokenCookie(res, newRefreshToken);
        
        logger.info(`[Auth] Access Token e Refresh Token renovados para ${payload.type} ID ${payload.userId || payload.adminId}. IP: ${req.ip}`);
        res.json({ accessToken: newAccessToken }); // Retorna SÓ o novo access token (o refresh token vai como cookie)
    } catch (error) {
        logger.error(`[Auth] Erro ao processar refresh token: ${error.message}. IP: ${req.ip}`);
        // Limpa o cookie de refresh token em caso de erro
        res.clearCookie('refreshToken', clearTokenCookieOptions);
        next(error); // Passa o erro para o handler
    }
};

const logout = async (req, res, _next) => {
    const requestRefreshToken = req.cookies?.refreshToken;
    let userId = null; let adminId = null; let accountType = null;
    try {
        if (requestRefreshToken) {
            // Decodifica mesmo se expirado para pegar o ID
            const decoded = jwtUtils.verifyRefreshToken(requestRefreshToken) || jwt.decode(requestRefreshToken);
            if (decoded) {
                userId = decoded.userId; adminId = decoded.adminId; accountType = decoded.type;
                // Limpa o hash do refresh token no DB para invalidá-lo permanentemente
                if (userId && accountType === 'user') await userModel.clearRefreshTokenHash(userId);
                if (adminId && accountType === 'admin') await adminModel.clearAdminRefreshTokenHash(adminId);

                // REMOVIDO: Tentativa de adicionar à blacklist Redis
                // if (decoded.jti && decoded.exp) { ... blacklistToken ... }
                logger.info(`[Auth] Logout - Hash RT limpo para ${accountType || 'unknown'} ID ${userId || adminId || 'N/A'}. IP: ${req.ip}`);
            }
        }
    } catch (error) { 
        logger.warn("Erro durante limpeza hash no logout (ignorado):", error.message); 
    }
    finally {
        // Usa as mesmas opções do servidor, mas com maxAge: 0 para expirar o cookie
        const cookieOptions = { ...req.app.get('cookieOptions') };
        cookieOptions.maxAge = 0; // Expira o cookie
        
        res.clearCookie('refreshToken', cookieOptions); // Limpa cookie httpOnly SEMPRE
        res.status(200).json({ status: 'success', message: 'Logout realizado com sucesso.' });
    }
};

// --- Funções de Reset de Senha ---
// NOTA: Esta função é APENAS para USUÁRIOS (clientes da landing page)
// Admins devem usar a rota específica de admin para reset de senha
const requestPasswordReset = async (req, res, next) => {
    const { email } = req.body; // Validado na rota
    try {
        // Busca APENAS em usuários (não em admins)
        const account = await userModel.findUserByEmailInternal(email);

        let resetEmailSent = false; // Flag para saber se o email foi (tentado) enviar
        if (account) {
            // Log detalhado para debugging - mostra todos os campos do account
            logger.info(`[Reset Req User] Conta encontrada: ${email}`);
            logger.info(`[Reset Req User] ID: ${account.id}, Nome: "${account.nome}"`);
            
            const resetToken = tokenUtils.generateSecureToken(); const hashedToken = tokenUtils.hashToken(resetToken);
            const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
            
            // Salva token apenas para usuário
            const saved = await userModel.savePasswordResetToken(account.id, hashedToken, expires);

            if (saved) {
                const resetUrl = `${config.frontendUrl}/reset-password/${resetToken}`; // Rota frontend
                
                // Garante que estamos usando o nome correto da conta encontrada
                const nomeUsuario = account.nome || account.name || 'Usuário';
                
                // Log do nome que será usado no email
                logger.info(`[Reset Req] Nome que será usado no email: "${nomeUsuario}"`);
                
                // Tenta enviar o email
                resetEmailSent = await emailUtils.sendEmail({
                    to: account.email, 
                    subject: 'ParkNow - Redefinição de Senha',
                    text: `Olá ${nomeUsuario},\n\nClique no link para redefinir sua senha ParkNow (válido por 15 min):\n${resetUrl}\n\nSe não foi você, ignore este email.`,
                    html: `<p>Olá ${nomeUsuario},</p><p>Clique <a href="${resetUrl}" target="_blank">aqui</a> para redefinir sua senha ParkNow (link válido por 15 minutos).</p><p>Se não foi você, ignore este email.</p>`
                });
                if (!resetEmailSent) logger.error(`[Reset Req] Falha ao ENVIAR email para ${email}`);
            } else {
                 throw new AppError('Falha ao salvar token de reset.', 500);
            }
        } else {
            logger.warn(`[Reset Req] Nenhuma conta encontrada para email: ${email}. IP: ${req.ip}`);
        }
        // Resposta genérica por segurança, mesmo se o email não foi enviado
        res.json({ message: 'Se uma conta com este email existir e o serviço de email estiver configurado, um link de redefinição foi enviado.' });
    } catch (error) { next(error); }
};

// NOTA: Esta função também é APENAS para USUÁRIOS (não admins)
const resetPassword = async (req, res, next) => {
    const { token } = req.params; // Validado na rota
    const { password: newPassword } = req.body; // Validado na rota (comprimento, confirmação)
    try {
        // Valida força da nova senha
        const ps = checkPasswordStrength(newPassword);
        if (ps.score < 2) return next(new BadRequestError(`Nova senha fraca.`, { suggestions: ps.feedback.suggestions || [] }));

        const hashedToken = tokenUtils.hashToken(token);
        // Busca APENAS em usuários (não em admins)
        const account = await userModel.findUserByValidResetToken(hashedToken);
        if (!account) throw new BadRequestError('Token de redefinição inválido ou expirado.'); // 400 Bad Request

        const newPasswordHash = await passwordUtils.hashPassword(newPassword);
        // Atualiza senha e limpa tokens apenas para usuário
        const updated = await userModel.updateUserPassword(account.id, newPasswordHash);
        if (!updated) throw new AppError('Falha ao atualizar a senha.', 500);

        logger.info(`[Reset Pass User] Senha resetada com sucesso para usuário ID ${account.id} (Email: ${account.email})`);
        res.json({ message: 'Senha redefinida com sucesso! Você já pode fazer login com a nova senha.' });

    } catch (error) { next(error); }
};

// --- Admin ---
const registerAdmin = async (req, res, next) => {
    // Validação feita na rota - CAPTURA TODOS OS CAMPOS
    const { 
        nome, 
        email, 
        senha, 
        cnpj,
        telefone,
        nomeEstacionamento, 
        enderecoEstacionamento, 
        cepEstacionamento,
        logradouroEstacionamento,
        numeroEstacionamento,
        complementoEstacionamento,
        bairroEstacionamento,
        cidadeEstacionamento,
        ufEstacionamento,
        latitude, 
        longitude, 
        numeroVagas, 
        precoHora, 
        precoDia, 
        descricao,
        horarioAbertura,
        horarioFechamento,
        // CAMPOS PIX
        chavePix,
        tipoChavePix,
        nomeTitularPix,
        fotoEstacionamento,
        fotoEstacionamentoNome
    } = req.body;
    const _fotoFile = req.file; // Do Multer (pode ser undefined)
    const ipAddress = req.ip || req.connection?.remoteAddress; // Pega IP

    try {
        // Valida força da senha (mesmo que rota valide comprimento, checa complexidade)
        const psAdm = checkPasswordStrength(senha, [email]);
        if (psAdm.score < 2) throw new BadRequestError(`Senha admin fraca.`, { suggestions: psAdm.feedback.suggestions || [] });

        // Verifica se email já existe como admin
        if (await adminModel.findAdminByEmail(email)) {
            throw new ConflictError("Este email já está cadastrado como administrador.");
        }
        
        // Verifica se email já existe como usuário
        if (await userModel.findUserByEmailInternal(email)) {
            throw new ConflictError("Este email já está cadastrado como usuário.");
        }

        // ARMAZENAR DADOS PARA APROVAÇÃO POSTERIOR
        const tempStorage = require('../utils/tempStorage');
        const crypto = require('crypto');
        
        // Gerar token único para aprovação
        const approvalToken = crypto.randomBytes(32).toString('hex');
        const storageKey = `parceria:${approvalToken}`;
        
        // Preparar dados completos para aprovação
        const solicitacaoData = {
            nome,
            email,
            senha, // Será hasheada na aprovação
            cnpj,
            telefone,
            nomeEstacionamento,
            enderecoEstacionamento,
            cepEstacionamento,
            logradouroEstacionamento,
            numeroEstacionamento,
            complementoEstacionamento,
            bairroEstacionamento,
            cidadeEstacionamento,
            ufEstacionamento,
            latitude,
            longitude,
            numeroVagas,
            precoHora,
            precoDia,
            descricao,
            horarioAbertura: horarioAbertura || '08:00',
            horarioFechamento: horarioFechamento || '20:00',
            chavePix,
            tipoChavePix,
            nomeTitularPix,
            fotoEstacionamento: fotoEstacionamento || null,
            fotoEstacionamentoNome: fotoEstacionamentoNome || null,
            dataRegistro: new Date().toISOString(),
            ip: ipAddress
        };
        
        // Armazenar com expiração de 7 dias (604800000 ms) — persistido no Postgres
        await tempStorage.set(storageKey, solicitacaoData, 604800000);
        
        logger.info('[Auth] Solicitação de parceria armazenada para aprovação', {
            email,
            nomeEstacionamento,
            token: approvalToken.substring(0, 8) + '...'
        });
        
        // ENVIAR EMAIL PARA PARKNOW APROVAR
        const { sendEmail } = require('../utils/emailUtils');
        const config = require('../config');
        
        const approvalUrl = `${config.appUrl || 'http://localhost:3000'}/api/approvals/approve-partner/${approvalToken}`;
        const rejectUrl = `${config.appUrl || 'http://localhost:3000'}/api/approvals/reject-partner/${approvalToken}`;
        
        // Email para admin ParkNow aprovar
        const adminEmail = process.env.ADMIN_EMAIL || 'parknow.sistema@gmail.com';
        
        try {
            await sendEmail({
                to: adminEmail,
                subject: '🚗 Nova Solicitação de Parceria ParkNow',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="margin: 0; font-size: 28px;">🚗 Nova Solicitação de Parceria</h1>
                        </div>
                        
                        <div style="background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 10px 10px;">
                            <h2 style="color: #333; margin-top: 0;">Dados do Solicitante</h2>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Nome:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${nome}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Email:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${email}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Telefone:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${telefone || 'Não informado'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>CNPJ:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${cnpj}</td>
                                </tr>
                            </table>
                            
                            <h2 style="color: #333;">Dados do Estacionamento</h2>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Nome:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${nomeEstacionamento}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Endereço:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${enderecoEstacionamento}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Cidade/UF:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${cidadeEstacionamento}/${ufEstacionamento}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Vagas:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${numeroVagas}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Preço/Hora:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">R$ ${precoHora}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Preço/Dia:</strong></td>
                                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">R$ ${precoDia}</td>
                                </tr>
                            </table>
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${approvalUrl}" 
                                   style="display: inline-block; background-color: #28a745; color: white; 
                                          padding: 15px 40px; text-decoration: none; border-radius: 5px; 
                                          font-weight: bold; font-size: 16px; margin: 0 10px;">
                                    ✅ APROVAR PARCERIA
                                </a>
                                
                                <a href="${rejectUrl}" 
                                   style="display: inline-block; background-color: #dc3545; color: white; 
                                          padding: 15px 40px; text-decoration: none; border-radius: 5px; 
                                          font-weight: bold; font-size: 16px; margin: 0 10px;">
                                    ❌ REJEITAR
                                </a>
                            </div>
                            
                            <p style="margin-top: 30px; font-size: 12px; color: #777; text-align: center;">
                                Esta solicitação expira em 7 dias.
                            </p>
                        </div>
                    </div>
                `,
                text: `Nova Solicitação de Parceria ParkNow

Dados do Solicitante:
- Nome: ${nome}
- Email: ${email}
- Telefone: ${telefone || 'Não informado'}
- CNPJ: ${cnpj}

Dados do Estacionamento:
- Nome: ${nomeEstacionamento}
- Endereço: ${enderecoEstacionamento}
- Cidade/UF: ${cidadeEstacionamento}/${ufEstacionamento}
- Vagas: ${numeroVagas}
- Preço/Hora: R$ ${precoHora}
- Preço/Dia: R$ ${precoDia}

Para aprovar: ${approvalUrl}
Para rejeitar: ${rejectUrl}

Esta solicitação expira em 7 dias.`
            });
            
            logger.info('[Auth] Email de aprovação enviado para admin ParkNow', { adminEmail });
        } catch (emailError) {
            logger.error('[Auth] Erro ao enviar email de aprovação:', emailError);
            // Não falha o registro se o email não for enviado
        }
        
        // Email de confirmação para o solicitante
        try {
            await sendEmail({
                to: email,
                subject: 'Solicitação de Parceria Recebida - ParkNow',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background-color: #667eea; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
                            <h1>Solicitação Recebida! 🎉</h1>
                        </div>
                        
                        <div style="background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
                            <p>Olá <strong>${nome}</strong>,</p>
                            
                            <p>Recebemos sua solicitação de parceria para o estacionamento <strong>${nomeEstacionamento}</strong>.</p>
                            
                            <div style="background-color: #e7f3ff; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0;">
                                <p style="margin: 0;"><strong>O que acontece agora?</strong></p>
                                <p style="margin: 10px 0 0 0;">Nossa equipe irá analisar sua solicitação e entrar em contato em até 48 horas úteis.</p>
                            </div>
                            
                            <p><strong>Dados da sua solicitação:</strong></p>
                            <ul>
                                <li>Estacionamento: ${nomeEstacionamento}</li>
                                <li>Endereço: ${enderecoEstacionamento}</li>
                                <li>Número de vagas: ${numeroVagas}</li>
                                <li>Email: ${email}</li>
                            </ul>
                            
                            <p>Caso tenha alguma dúvida, entre em contato conosco.</p>
                            
                            <p>Atenciosamente,<br><strong>Equipe ParkNow</strong></p>
                        </div>
                        
                        <div style="text-align: center; padding: 15px; font-size: 12px; color: #777;">
                            © ${new Date().getFullYear()} ParkNow - Todos os direitos reservados
                        </div>
                    </div>
                `,
                text: `Olá ${nome},

Recebemos sua solicitação de parceria para o estacionamento ${nomeEstacionamento}.

O que acontece agora?
Nossa equipe irá analisar sua solicitação e entrar em contato em até 48 horas úteis.

Dados da sua solicitação:
- Estacionamento: ${nomeEstacionamento}
- Endereço: ${enderecoEstacionamento}
- Número de vagas: ${numeroVagas}
- Email: ${email}

Caso tenha alguma dúvida, entre em contato conosco.

Atenciosamente,
Equipe ParkNow

© ${new Date().getFullYear()} ParkNow - Todos os direitos reservados`
            });
            
            logger.info('[Auth] Email de confirmação enviado para solicitante', { email });
        } catch (emailError) {
            logger.error('[Auth] Erro ao enviar email de confirmação:', emailError);
        }

        res.status(200).json({ 
            status: "success", 
            message: "Solicitação de parceria enviada com sucesso! Você receberá um email quando for aprovada."
        });
        
    } catch (error) {
        logger.error("Erro ao enviar solicitação de parceria:", error);
        next(error); // Passa erro para o handler global
    }
};

const loginAdmin = async (req, res, next) => {
    const { email, senha } = req.body; // Validado na rota
    try {
        const admin = await adminModel.findAdminByEmail(email); // Busca admin ATIVO
        
        if (!admin) {
            logger.warn(`[Auth] Tentativa de login com email não cadastrado: ${email}. IP: ${req.ip}`);
            throw new AuthenticationError("Email ou senha inválidos!");
        }
        
        // Verifica se a senha está correta usando bcrypt
        const isPasswordValid = await bcrypt.compare(senha, admin.senha);
        if (!isPasswordValid) {
            logger.warn(`[Auth] Senha inválida para admin: ${email}. IP: ${req.ip}`);
            throw new AuthenticationError("Email ou senha inválidos!");
        }
        
        // Verifica se o admin está ativo
        if (admin.status !== 'ativo') {
            logger.warn(`[Auth] Tentativa de login em conta inativa: ${email}. IP: ${req.ip}`);
            throw new AuthenticationError("Esta conta está inativa. Entre em contato com o suporte.");
        }

        // Gera tokens
        const payload = { adminId: admin.id, type: 'admin' };
        const accessToken = jwtUtils.generateAccessToken(payload);
        const refreshToken = jwtUtils.generateRefreshToken(payload);
        const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
        
        // Atualiza o hash do refresh token no banco de dados
        await adminModel.saveAdminRefreshTokenHash(admin.id, refreshTokenHash);

        // Remove dados sensíveis antes de enviar a resposta
        const adminData = { ...admin };
        delete adminData.senha;
        delete adminData.refresh_token_hash;
        delete adminData.reset_token;
        delete adminData.reset_token_expires;
        
        // Configura o cookie com o refresh token
        setRefreshTokenCookie(res, refreshToken);
        
        logger.info(`[Auth] Admin logado com sucesso: ${email} (ID: ${admin.id}). IP: ${req.ip}`);
        
        // Retorna os tokens e os dados do admin (sem informações sensíveis)
        res.json({ 
            status: "success", 
            message: "Login realizado com sucesso!", 
            accessToken, 
            admin: adminData 
        });
        
    } catch (error) { 
        next(error); 
    }
};

// --- Verificação de Email ---
// GET /api/auth/verify-email/:token — clicado no link enviado por email.
// Redireciona para a landing com um query param (sucesso/erro) para feedback visual.
const verifyEmail = async (req, res, _next) => {
    const { token } = req.params;
    const base = config.frontendUrl || '';
    try {
        if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
            return res.redirect(`${base}/?email_verificado=invalido`);
        }
        const hashedToken = tokenUtils.hashToken(token);
        const account = await userModel.findUserByEmailVerificationToken(hashedToken);
        if (!account) {
            logger.warn('[Auth] Token de verificação de email inválido/expirado');
            return res.redirect(`${base}/?email_verificado=expirado`);
        }
        await userModel.markEmailVerified(account.id);
        logger.info(`[Auth] Email verificado com sucesso para usuário ID ${account.id} (${account.email})`);
        return res.redirect(`${base}/?email_verificado=sucesso`);
    } catch (error) {
        logger.error('[Auth] Erro ao verificar email:', error);
        return res.redirect(`${base}/?email_verificado=erro`);
    }
};

module.exports = { registerUser, loginUser, refreshToken, logout, requestPasswordReset, resetPassword, registerAdmin, loginAdmin, verifyEmail };