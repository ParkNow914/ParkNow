// controllers/authController.js
// Lida com a lógica de registro, login, refresh, logout e reset de senha.

// Models
const userModel = require('../models/userModel');
const adminModel = require('../models/adminModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const vagaModel = require('../models/vagaModel');
const logModel = require('../models/logModel'); // Adicionando o modelo de log faltante
// Utils
const passwordUtils = require('../utils/passwordUtils');
const jwtUtils = require('../utils/jwtUtils');
const tokenUtils = require('../utils/tokenUtils'); // Para reset
const emailUtils = require('../utils/emailUtils'); // Para reset
const { checkPasswordStrength } = require('../utils/zxcvbnUtil');
const { AppError, AuthenticationError, BadRequestError, AuthorizationError, ValidationError, ConflictError } = require('../utils/AppError'); // Erros customizados
const bcrypt = require('bcrypt');
const logger = require('../utils/logger'); // Logger Winston
const config = require('../config');
const pool = require('../models/db'); // Para transação no registerAdmin
const fs = require('fs'); // Adicionando o módulo fs que faltava
const asaasMarketplaceService = require('../services/asaasMarketplaceService'); // Para conectar ao ASAAS
const db = require('../config/db'); // Para queries diretas
// Import desabilitado pois Redis foi removido
// const { isRedisAvailable, blacklistToken, isTokenBlacklisted } = require('../utils/redisClient');

const BCRYPT_SALT_ROUNDS = 10; // Custo para hash do refresh token
// Opções base para cookie, maxAge será adicionado dinamicamente
const refreshTokenCookieOptions = { ...config.cookieProps };
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

        // Opcional: Enviar email de boas-vindas
        await emailUtils.sendEmail({
            to: email, subject: 'Bem-vindo ao ParkNow!',
            text: `Olá ${nome},\n\nSua conta ParkNow foi criada!\n\nAcesse: ${config.frontendUrl}`,
            html: `<p>Olá ${nome},</p><p>Sua conta ParkNow foi criada com sucesso!</p><p><a href="${config.frontendUrl}">Acesse agora</a>.</p>`
        }).catch(e => logger.error("Falha ao enviar email de boas-vindas:", { email: email, error: e.message }));

        logger.info(`Usuário registrado: ${email} (ID: ${userId})`);
        res.status(201).json({ status: "success", message: "Cadastro realizado com sucesso! Você já pode fazer o login." });
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

const logout = async (req, res, next) => {
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
        horarioFechamento
    } = req.body;
    const fotoFile = req.file; // Do Multer (pode ser undefined)
    const ipAddress = req.ip || req.connection?.remoteAddress; // Pega IP

    const client = await pool.connect(); // Obtém conexão para transação
    try {
        await client.query('BEGIN'); // Inicia transação

        // Valida força da senha (mesmo que rota valide comprimento, checa complexidade)
        const psAdm = checkPasswordStrength(senha, [nome, email]);
        if (psAdm.score < 3) throw new BadRequestError(`Senha admin fraca.`, { suggestions: psAdm.feedback.suggestions || [] });

        // Verifica se email já existe como admin
        if (await adminModel.findAdminByEmail(email)) {
            throw new ConflictError("Este email já está cadastrado como administrador.");
        }
        
        // Verifica se email já existe como usuário
        if (await userModel.findUserByEmailInternal(email)) {
            throw new ConflictError("Este email já está cadastrado como usuário.");
        }

        // Cria hash da senha
        const senhaHash = await passwordUtils.hashPassword(senha);

        // Cria o admin COM telefone e CNPJ
        const adminId = await adminModel.createAdmin({ 
            nome, 
            email, 
            senhaHash,
            telefone: telefone || null,
            cnpj: cnpj || null
        });

        // Cria o estacionamento associado COM TODOS OS CAMPOS DE ENDEREÇO
        const estData = { 
            nome: nomeEstacionamento, 
            cnpj: cnpj || null,
            telefone: telefone || null,
            email: email,
            latitude, 
            longitude, 
            endereco: enderecoEstacionamento,
            cep: cepEstacionamento || null,
            logradouro: logradouroEstacionamento || null,
            numero: numeroEstacionamento || null,
            complemento: complementoEstacionamento || null,
            bairro: bairroEstacionamento || null,
            cidade: cidadeEstacionamento || null,
            uf: ufEstacionamento || null,
            foto: fotoFile ? fotoFile.filename : null, 
            vagas: parseInt(numeroVagas), 
            preco_hora: precoHora, 
            preco_dia: precoDia, 
            descricao, 
            horario_abertura: horarioAbertura || '08:00:00',
            horario_fechamento: horarioFechamento || '20:00:00',
            admin_id: adminId 
        };
        const estId = await estacionamentoModel.createEstacionamento(estData);

        // Cria as vagas iniciais DENTRO da transação, passando a conexão
        await vagaModel.createInitialVagas(estId, parseInt(numeroVagas), connection);

        // Conectar automaticamente ao ASAAS (criar subconta)
        try {
            logger.info(`Conectando estacionamento ${estId} ao ASAAS automaticamente...`);
            
            if (email && cnpj) {
                // Criar subconta ASAAS
                const subconta = await asaasMarketplaceService.criarSubconta({
                    nome: nomeEstacionamento,
                    email: email,
                    cpfCnpj: cnpj,
                    telefone: telefone || '11999999999'
                });
                
                if (subconta.walletId) {
                    // Atualizar estacionamento com wallet_id
                    const updateQuery = `
                        UPDATE estacionamentos
                        SET asaas_wallet_id = $1, asaas_connected_at = NOW()
                        WHERE id = $2
                    `;
                    await db.query(updateQuery, [subconta.walletId, estId]);
                    
                    logger.info(`✅ Estacionamento ${estId} conectado ao ASAAS automaticamente no registro`, {
                        wallet_id: subconta.walletId,
                        admin_id: adminId
                    });
                }
            } else {
                logger.warn(`⚠️ Registro sem CNPJ - estacionamento ${estId} não conectado ao ASAAS`, {
                    estacionamento_id: estId,
                    tem_email: !!email,
                    tem_cnpj: !!cnpj
                });
            }
        } catch (asaasError) {
            // Não falhar o registro se der erro no ASAAS
            logger.error('Erro ao conectar estacionamento ao ASAAS durante registro (continuando):', {
                error: asaasError.message,
                estacionamento_id: estId,
                admin_id: adminId
            });
        }

        await client.query('COMMIT'); // Confirma a transação

        logger.info(`Admin ${adminId} (${email}) e Est. ${estId} (${nomeEstacionamento}) criados. IP: ${ipAddress}`);
        await logModel.createAdminLog(adminId, `Criou conta e Estacionamento ID ${estId} (${nomeEstacionamento})`, ipAddress); // Log ação admin

        res.status(201).json({ status: "success", message: "Administrador e estacionamento cadastrados com sucesso!" });
    } catch (error) {
        await client.query('ROLLBACK'); // Desfaz a transação em caso de erro
        logger.error("Erro registro admin/estacionamento:", error);
        // Deleta arquivo de foto se upload ocorreu mas DB falhou?
        if (fotoFile && fs.existsSync(fotoFile.path)) {
            fs.unlink(fotoFile.path, (err) => {
                if(err) logger.error(`Falha ao remover foto ${fotoFile.filename} após erro no registro:`, err);
                else logger.info(`Foto ${fotoFile.filename} removida após erro no registro.`);
            });
        }
        // Trata erro de duplicação especificamente
        if (error.code === 'ER_DUP_ENTRY') {
             next(new ConflictError("Email de administrador já cadastrado."));
        } else {
            next(error); // Passa outros erros para o handler global
        }
    } finally {
        client.release(); // Libera a conexão SEMPRE
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

module.exports = { registerUser, loginUser, refreshToken, logout, requestPasswordReset, resetPassword, registerAdmin, loginAdmin };