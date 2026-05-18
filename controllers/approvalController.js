// controllers/approvalController.js
const config = require('../config');
const db = require('../models'); // Usando o Sequelize
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const { Op: _Op } = require('sequelize');
const HorarioFuncionamentoController = require('./horarioFuncionamentoController');
const tempStorage = require('../utils/tempStorage');
const emailConfig = require('../config/emailConfig');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const _adminModel = require('../models/adminModel');

// Prefixo para as chaves de token no armazenamento temporário
const TOKEN_PREFIX = 'parceria:';
const _TOKEN_EXPIRATION = 24 * 60 * 60 * 1000; // 24 horas
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 segundo

// Configuração otimizada do transporte de email

/**
 * Envia um email de confirmação de aprovação de parceria
 * @param {Object} solicitacaoData - Dados da solicitação
 * @param {string} nomeEstacionamento - Nome do estacionamento aprovado
 * @returns {Promise<void>}
 */
const sendConfirmationEmail = async (solicitacaoData, nomeEstacionamento) => {
  try {
    const mailOptions = {
      from: `"ParkNow" <${emailConfig.auth.user}>`,
      to: solicitacaoData.email,
      subject: 'Parceria Aprovada - Seu Estacionamento no ParkNow',
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; padding: 20px; text-align: center; color: white;">
            <h1>Parabéns!</h1>
            <h2>Sua parceria com o ParkNow foi aprovada</h2>
          </div>
          <div style="padding: 20px;">
            <p>Olá ${solicitacaoData.nome},</p>
            <p>É com grande satisfação que informamos que a parceria do estacionamento <strong>${nomeEstacionamento}</strong> foi aprovada com sucesso em nossa plataforma.</p>
            
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
              <h3 style="margin-top: 0;">Seus dados de acesso:</h3>
              <p><strong>Email:</strong> ${solicitacaoData.email}</p>
              <p><strong>Senha:</strong> A senha que você definiu durante o cadastro</p>
            </div>
            
            <p>Você já pode acessar o painel administrativo através do link abaixo:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${config.appUrl}/admin/login" 
                 style="display: inline-block; background-color: #4CAF50; color: white; 
                        padding: 12px 24px; text-decoration: none; border-radius: 4px; 
                        font-weight: bold;">
                Acessar Painel Administrativo
              </a>
            </p>
            
            <p>Em caso de dúvidas ou problemas, entre em contato com nosso suporte.</p>
            
            <p>Atenciosamente,<br>Equipe ParkNow</p>
          </div>
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #777;">
            <p>Este é um email automático, por favor não responda a esta mensagem.</p>
            <p>© ${new Date().getFullYear()} ParkNow - Todos os direitos reservados</p>
          </div>
        </div>
      `,
      text: `Parabéns!\n\nSua parceria com o ParkNow foi aprovada.\n\n` +
            `Olá ${solicitacaoData.nome},\n\n` +
            `É com grande satisfação que informamos que a parceria do estacionamento ${nomeEstacionamento} foi aprovada com sucesso em nossa plataforma.\n\n` +
            `Seus dados de acesso:\n` +
            `Email: ${solicitacaoData.email}\n` +
            `Senha: A senha que você definiu durante o cadastro\n\n` +
            `Acesse o painel administrativo em: ${config.appUrl}/admin/login\n\n` +
            `Atenciosamente,\nEquipe ParkNow`
    };

    await sendEmail(mailOptions);
    logger.info('Email de confirmação de aprovação enviado com sucesso', {
      to: solicitacaoData.email,
      estacionamento: nomeEstacionamento
    });
  } catch (error) {
    logger.error('Erro ao enviar email de confirmação de aprovação', {
      error: error.message,
      stack: error.stack,
      email: solicitacaoData.email,
      estacionamento: nomeEstacionamento
    });
    // Não lançar o erro para não interromper o fluxo principal
  }
};

// Configuração otimizada do transporte de email
const transporter = nodemailer.createTransport({
  ...emailConfig,
  pool: true, // Usar conexão em pool para melhor performance
  maxConnections: 5, // Número máximo de conexões simultâneas
  maxMessages: 100, // Número máximo de mensagens por conexão
  rateDelta: 1000, // Aumentar taxa de envio em 1 segundo
  rateLimit: 10, // Limite de 10 mensagens por rateDelta
  from: `"ParkNow" <${config.email.auth.user}>`,
});

// Cache para armazenar erros de email recentes
const emailErrorCache = new Map();
const EMAIL_ERROR_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Envia um email com tratamento de erros e retry automático
 * @param {object} mailOptions - Opções do email
 * @param {number} attempt - Número da tentativa atual
 * @returns {Promise<object>} - Informações do email enviado
 */
const sendEmail = async (mailOptions, attempt = 1) => {
  const emailId = `${mailOptions.to}:${mailOptions.subject}:${Date.now()}`;
  
  try {
    // Verificar se há erros recentes para este destinatário
    const lastError = emailErrorCache.get(mailOptions.to);
    if (lastError && (Date.now() - lastError.timestamp) < EMAIL_ERROR_CACHE_TTL) {
      logger.warn(`Tentativa de envio bloqueada devido a erros recentes para ${mailOptions.to}`, {
        lastError: lastError.message,
        timeSinceLastError: Date.now() - lastError.timestamp,
        ttl: EMAIL_ERROR_CACHE_TTL
      });
      throw new Error(`Bloqueado devido a erros recentes: ${lastError.message}`);
    }

    const info = await transporter.sendMail({
      ...mailOptions,
      headers: {
        ...emailConfig.headers,
        'X-Email-ID': emailId,
        'X-Attempt': attempt,
        'X-Max-Attempts': MAX_RETRY_ATTEMPTS,
        ...(mailOptions.headers || {})
      },
      priority: 'high',
      encoding: 'utf-8',
      textEncoding: 'quoted-printable',
      dsn: {
        id: `parknow-${Date.now()}`,
        return: 'headers',
        notify: ['failure', 'delay'],
        recipient: config.email.admin
      }
    });
    
    logger.info('Email enviado com sucesso', {
      messageId: info.messageId,
      to: mailOptions.to,
      subject: mailOptions.subject,
      attempt,
      response: info.response
    });
    
    // Limpar cache de erros se existir
    if (emailErrorCache.has(mailOptions.to)) {
      emailErrorCache.delete(mailOptions.to);
    }
    
    return info;
  } catch (error) {
    const errorDetails = {
      error: error.message,
      stack: error.stack,
      to: mailOptions.to,
      subject: mailOptions.subject,
      attempt,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      timestamp: new Date().toISOString()
    };
    
    logger.error('Erro ao enviar email', errorDetails);
    
    // Adicionar ao cache de erros
    emailErrorCache.set(mailOptions.to, {
      message: error.message,
      timestamp: Date.now(),
      details: errorDetails
    });
    
    // Tentar novamente se não excedeu o número máximo de tentativas
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Backoff exponencial
      logger.warn(`Tentando novamente em ${delay}ms (tentativa ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
      
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            const result = await sendEmail(mailOptions, attempt + 1);
            resolve(result);
          } catch (retryError) {
            resolve({ error: retryError });
          }
        }, delay);
      });
    }
    
    // Se chegou aqui, todas as tentativas falharam
    throw new Error(`Falha após ${MAX_RETRY_ATTEMPTS} tentativas: ${error.message}`);
  }
};

/**
 * Valida os dados da solicitação de parceria
 * @param {object} data - Dados da solicitação
 * @param {boolean} [isUpdate=false] - Se é uma atualização (permite campos ausentes)
 * @throws {Error} Se os dados forem inválidos
 */
const validatePartnerRequest = (data, isUpdate = false) => {
  // Definir campos obrigatórios
  const requiredFields = [
    { name: 'nome', type: 'string', min: 3, max: 100 },
    { name: 'email', type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    { name: 'senha', type: 'string', min: 8, max: 100, required: !isUpdate },
    { name: 'nomeEstacionamento', type: 'string', min: 3, max: 200 },
    { name: 'enderecoEstacionamento', type: 'string', min: 10, max: 500 },
    { name: 'cnpj', type: 'string', pattern: /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/ },
    { name: 'numeroVagas', type: 'number', min: 1, max: 1000, coerce: true }
  ];

  const errors = [];
  const validatedData = {};

  // Validar cada campo
  for (const field of requiredFields) {
    const value = data[field.name];
    
    // Pular campos não obrigatórios em atualizações
    if ((value === undefined || value === null || value === '') && (!field.required || isUpdate)) {
      continue;
    }
    
    // Verificar campos obrigatórios
    if ((value === undefined || value === null || value === '') && field.required !== false) {
      errors.push(`O campo '${field.name}' é obrigatório`);
      continue;
    }

    // Coercion de tipo
    let processedValue = value;
    if (field.type === 'number' && field.coerce) {
      processedValue = Number(value);
      if (isNaN(processedValue)) {
        errors.push(`O campo '${field.name}' deve ser um número válido`);
        continue;
      }
    }

    // Validar tipo
    if (field.type && typeof processedValue !== field.type) {
      errors.push(`O campo '${field.name}' deve ser do tipo ${field.type}`);
      continue;
    }

    // Validar tamanho mínimo/máximo para strings
    if (field.type === 'string' && (field.min !== undefined || field.max !== undefined)) {
      const length = String(processedValue).length;
      if (field.min !== undefined && length < field.min) {
        errors.push(`O campo '${field.name}' deve ter no mínimo ${field.min} caracteres`);
      }
      if (field.max !== undefined && length > field.max) {
        errors.push(`O campo '${field.name}' deve ter no máximo ${field.max} caracteres`);
      }
    }

    // Validar valor mínimo/máximo para números
    if (field.type === 'number') {
      if (field.min !== undefined && processedValue < field.min) {
        errors.push(`O valor mínimo para '${field.name}' é ${field.min}`);
      }
      if (field.max !== undefined && processedValue > field.max) {
        errors.push(`O valor máximo para '${field.name}' é ${field.max}`);
      }
    }

    // Validar padrão regex
    if (field.pattern && !field.pattern.test(processedValue)) {
      errors.push(`O campo '${field.name}' está em um formato inválido`);
      continue;
    }

    // Adicionar valor validado ao objeto de retorno
    validatedData[field.name] = processedValue;
  }

  // Validações adicionais
  if (validatedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validatedData.email)) {
    errors.push('Formato de email inválido');
  }

  if (validatedData.cnpj && !/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(validatedData.cnpj)) {
    errors.push('CNPJ inválido');
  }

  if (errors.length > 0) {
    throw new Error(`Erros de validação: ${errors.join('; ')}`);
  }

  return validatedData;
};

/**
 * Formata um CNPJ para o padrão 00.000.000/0000-00
 * @param {string} cnpj - CNPJ a ser formatado
 * @returns {string} CNPJ formatado
 */
const _formatCNPJ = (cnpj) => {
  if (!cnpj) return '';
  // Remove tudo que não for dígito
  const digits = cnpj.replace(/\D/g, '');
  
  // Aplica a máscara
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
};

/**
 * Gera uma senha aleatória
 * @param {number} length - Comprimento da senha
 * @returns {string} Senha aleatória
 */
const _generateRandomPassword = (length = 12) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]\\:;?><,./-=';
  const crypto = require('crypto');
  let password = '';
  const values = new Uint32Array(length);
  crypto.randomFillSync(values);

  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length];
  }
  
  // Garantir que a senha atenda aos requisitos mínimos
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+~`|}{[\]\\:;?><,./\-=])/.test(password)) {
    // Se não atender aos requisitos, tenta novamente (máximo de 3 tentativas)
    if (length < 8) return _generateRandomPassword(12);
    return _generateRandomPassword(length);
  }
  
  return password;
};

/**
 * Criptografa uma senha usando bcrypt
 * @param {string} password - Senha em texto plano
 * @returns {Promise<string>} Hash da senha
 */
const _hashPassword = async (password) => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

/**
 * Verifica se uma senha corresponde a um hash
 * @param {string} password - Senha em texto plano
 * @param {string} hash - Hash da senha
 * @returns {Promise<boolean>} True se a senha for válida
 */
const _verifyPassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Erro ao verificar senha', { error: error.message });
    return false;
  }
};

/**
 * Gera um token seguro para confirmação
 * @param {number} [length=64] - Comprimento do token em bytes
 * @returns {Promise<string>} Token hexadecimal
 */
const _generateToken = (length = 64) => {
  return new Promise((resolve, reject) => {
    require('crypto').randomBytes(length, (err, buffer) => {
      if (err) {
        logger.error('Erro ao gerar token', { error: err.message });
        return reject(err);
      }
      resolve(buffer.toString('hex'));
    });
  });
};

/**
 * Formata uma data para o formato brasileiro
 * @param {Date|string} date - Data a ser formatada
 * @param {boolean} [includeTime=false] - Incluir hora
 * @returns {string} Data formatada
 */
const _formatDate = (date, includeTime = false) => {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Data inválida';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return includeTime 
    ? `${day}/${month}/${year} ${hours}:${minutes}` 
    : `${day}/${month}/${year}`;
}

/**
 * Aprova uma solicitação de parceria via token
 * Cria o admin e o estacionamento no banco de dados apenas se a aprovação for bem-sucedida
 * @param {Object} req - Objeto de requisição do Express
 * @param {Object} res - Objeto de resposta do Express
 * @returns {Promise<void>}
 */
exports.approvePartner = async (req, res) => {
  const { token } = req.params;
  const storageKey = `${TOKEN_PREFIX}${token}`;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  let _client = null;
  let _transactionCompleted = false;
  let _adminId = null;
  let _estacionamentoId = null;
  
  // Configuração de timeouts
  const TIMEOUTS = {
    DATABASE: 15000, // 15 segundos para operações no banco
    EMAIL: 10000,   // 10 segundos para envio de email
    REQUEST: 30000  // 30 segundos para toda a requisição
  };
  
  // Configurar timeout para a requisição inteira
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      logger.error('Tempo limite da requisição excedido', { requestId, elapsed: Date.now() - startTime });
      res.status(503).json({
        success: false,
        error: 'REQUEST_TIMEOUT',
        message: 'Tempo limite da requisição excedido',
        requestId,
        timestamp: new Date().toISOString()
      });
    }
    // Forçar encerramento do processo se não conseguir responder
    if (!res.finished) {
      res.end();
      return res.status(400).json({
        success: false,
        error: 'REQUEST_TIMEOUT',
        message: 'Não foi possível processar a solicitação dentro do tempo limite.'
      });
    }
    
  }, TIMEOUTS.REQUEST);

  try {
    // 1. Obter os dados da solicitação do armazenamento temporário
    const solicitacaoData = tempStorage.get(storageKey);
    if (!solicitacaoData) {
      clearTimeout(requestTimeout);
      return res.status(404).json({
        success: false,
        error: 'Solicitação não encontrada',
        message: 'O token de aprovação é inválido ou expirou.'
      });
    }

    // LOG PARA DEBUG: Verificar dados recuperados do tempStorage
    logger.info('Dados recuperados do tempStorage:', {
      nome: solicitacaoData.nome,
      email: solicitacaoData.email,
      telefone: solicitacaoData.telefone,
      cnpj: solicitacaoData.cnpj,
      nomeEstacionamento: solicitacaoData.nomeEstacionamento,
      enderecoEstacionamento: solicitacaoData.enderecoEstacionamento,
      cepEstacionamento: solicitacaoData.cepEstacionamento,
      logradouroEstacionamento: solicitacaoData.logradouroEstacionamento,
      numeroEstacionamento: solicitacaoData.numeroEstacionamento,
      complementoEstacionamento: solicitacaoData.complementoEstacionamento,
      bairroEstacionamento: solicitacaoData.bairroEstacionamento,
      cidadeEstacionamento: solicitacaoData.cidadeEstacionamento,
      ufEstacionamento: solicitacaoData.ufEstacionamento,
      latitude: solicitacaoData.latitude,
      longitude: solicitacaoData.longitude,
      numeroVagas: solicitacaoData.numeroVagas,
      precoHora: solicitacaoData.precoHora,
      precoDia: solicitacaoData.precoDia
    });

    // 2. Validar os dados da solicitação
    try {
      validatePartnerRequest(solicitacaoData);
    } catch (validationError) {
      clearTimeout(requestTimeout);
      return res.status(400).json({
        success: false,
        error: 'Dados Inválidos',
        message: `Não foi possível processar a solicitação: ${validationError.message}`
      });
    }
    
    // 3. Iniciar transação no banco de dados
    const transaction = await db.sequelize.transaction();
    
    try {
      // 4. Verificar se o email já está em uso
      const existingAdmin = await db.sequelize.query(
        'SELECT * FROM admins WHERE email = :email AND status = \'ativo\' LIMIT 1',
        {
          replacements: { email: solicitacaoData.email },
          type: db.sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      
      if (existingAdmin && existingAdmin.length > 0) {
        throw new AppError('Este email já está em uso por outro administrador.', 400);
      }
      
      // 5. Verificar se o CNPJ já está cadastrado
      const existingEstacionamento = await db.sequelize.query(
        'SELECT id FROM estacionamentos WHERE cnpj = :cnpj LIMIT 1',
        {
          replacements: { cnpj: solicitacaoData.cnpj.replace(/[^\d]/g, '') }, // Remove formatação
          type: db.sequelize.QueryTypes.SELECT,
          plain: true, // Retorna apenas um registro ou null
          transaction
        }
      );
      
      if (existingEstacionamento) {
        throw new AppError('Este CNPJ já está cadastrado no sistema.', 400);
      }
      
      // 6. Criar o administrador
      logger.info('Criando conta de administrador...', { email: solicitacaoData.email });
      
      // Usar query direta com a transação para manter consistência
      const [adminResult] = await db.sequelize.query(
        `INSERT INTO admins (nome, email, telefone, cnpj, senha, nivel_acesso, status, created_at, updated_at) 
         VALUES (:nome, :email, :telefone, :cnpj, :senhaHash, 'estacionamento', 'ativo', NOW(), NOW()) 
         RETURNING id`,
        {
          replacements: {
            nome: solicitacaoData.nome,
            email: solicitacaoData.email,
            telefone: solicitacaoData.telefone || null,
            cnpj: solicitacaoData.cnpj.replace(/[^\d]/g, ''), // CNPJ sem formatação
            senhaHash: await bcrypt.hash(solicitacaoData.senha, 12)
          },
          type: db.sequelize.QueryTypes.INSERT,
          transaction
        }
      );
      
      if (!adminResult || !adminResult[0] || !adminResult[0].id) {
        throw new Error('Falha ao criar administrador: ID não retornado');
      }
      
      const adminId = adminResult[0].id;
      logger.info('Admin criado com sucesso', { adminId });
      
      // 7. Processar e salvar foto do estacionamento (se houver)
      let fotoPath = null;
      if (solicitacaoData.fotoEstacionamento) {
        try {
          const fs = require('fs').promises;
          const path = require('path');
          
          // Decodificar base64
          const base64Data = solicitacaoData.fotoEstacionamento.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Gerar nome único para o arquivo
          const ext = solicitacaoData.fotoEstacionamentoNome 
            ? path.extname(solicitacaoData.fotoEstacionamentoNome) 
            : '.jpg';
          const fileName = `estacionamento_${adminId}_${Date.now()}${ext}`;
          const uploadDir = path.join(__dirname, '..', 'uploads', 'estacionamentos');
          const filePath = path.join(uploadDir, fileName);
          
          // Criar diretório se não existir
          await fs.mkdir(uploadDir, { recursive: true });
          
          // Salvar arquivo
          await fs.writeFile(filePath, buffer);
          
          // Caminho relativo para salvar no banco
          fotoPath = `/uploads/estacionamentos/${fileName}`;
          logger.info('Foto do estacionamento salva com sucesso', { fotoPath });
        } catch (error) {
          logger.error('Erro ao salvar foto do estacionamento', { error: error.message });
          // Continuar mesmo se falhar ao salvar a foto
        }
      }
      
      // 8. Criar o estacionamento
      const numeroVagas = parseInt(solicitacaoData.numeroVagas, 10) || 1;
      const valorHora = parseFloat(solicitacaoData.precoHora) || 5.0;
      const valorDiaria = parseFloat(solicitacaoData.precoDia) || 30.0;
      const valorMensal = valorDiaria * 20; // 20 dias úteis
      
      // Usar horários fornecidos pelo usuário ou valores padrão
      const horarioAbertura = solicitacaoData.horarioAbertura ? 
        `${solicitacaoData.horarioAbertura}:00` : '08:00:00';
      const horarioFechamento = solicitacaoData.horarioFechamento ? 
        `${solicitacaoData.horarioFechamento}:00` : '20:00:00';
      
      // Garantir que os campos obrigatórios estejam preenchidos
      const endereco = solicitacaoData.enderecoEstacionamento || 'Endereço não informado';
      const telefone = solicitacaoData.telefone || '';
      
      // Chave PIX sempre será o CNPJ (sem formatação)
      const cnpjSemFormatacao = solicitacaoData.cnpj.replace(/[^\d]/g, '');
      const chavePix = solicitacaoData.chavePix || cnpjSemFormatacao;
      const tipoChavePix = 'cnpj'; // Sempre CNPJ
      
      // Nome do titular PIX sempre será o nome do estacionamento
      const nomeTitularPix = solicitacaoData.nomeTitularPix || solicitacaoData.nomeEstacionamento;
      
      logger.info('Criando estacionamento...', {
        nome: solicitacaoData.nomeEstacionamento,
        numeroVagas,
        adminId,
        chavePix: chavePix ? 'configurada' : 'não configurada',
        telefone: telefone || 'não informado'
      });
      
      // Criar objeto com TODOS os campos da tabela
      const dadosEstacionamento = {
        nome: solicitacaoData.nomeEstacionamento,
        endereco: endereco,
        // Campos de endereço detalhado
        cep: solicitacaoData.cepEstacionamento || null,
        logradouro: solicitacaoData.logradouroEstacionamento || null,
        numero: solicitacaoData.numeroEstacionamento || null,
        complemento: solicitacaoData.complementoEstacionamento || null,
        bairro: solicitacaoData.bairroEstacionamento || null,
        cidade: solicitacaoData.cidadeEstacionamento || null,
        uf: solicitacaoData.ufEstacionamento || null,
        // Campos de capacidade e valores
        capacidade_total: numeroVagas,
        vagas_disponiveis: numeroVagas,
        vagas: numeroVagas,
        valor_hora: valorHora,
        preco_hora: valorHora,
        valor_diaria: valorDiaria,
        preco_dia: valorDiaria,
        valor_mensal: valorMensal,
        // Coordenadas
        latitude: solicitacaoData.latitude ? parseFloat(solicitacaoData.latitude) : null,
        longitude: solicitacaoData.longitude ? parseFloat(solicitacaoData.longitude) : null,
        // Outros campos
        descricao: solicitacaoData.descricao || 'Estacionamento parceiro ParkNow',
        admin_id: adminId,
        cnpj: cnpjSemFormatacao,
        email: solicitacaoData.email,
        telefone: telefone,
        status: 'ativo',
        horario_abertura: horarioAbertura,
        horario_fechamento: horarioFechamento,
        // Campos opcionais
        foto: fotoPath,
        chave_pix: chavePix,
        tipo_chave_pix: tipoChavePix,
        nome_titular_pix: nomeTitularPix,
        chave_pix_cnpj: null,
        id_solicitacao: null
      };
      
      logger.debug('Dados do estacionamento a serem salvos:', dadosEstacionamento);
      
      // Usar query raw para evitar problemas com o modelo
      const [estacionamentoId] = await db.sequelize.query(
        `INSERT INTO estacionamentos (
          nome, endereco, cep, logradouro, numero, complemento, bairro, cidade, uf,
          capacidade_total, vagas_disponiveis, vagas,
          valor_hora, preco_hora, valor_diaria, preco_dia, valor_mensal,
          latitude, longitude, descricao, admin_id, cnpj, email, telefone,
          status, horario_abertura, horario_fechamento, foto, 
          chave_pix, tipo_chave_pix, nome_titular_pix, chave_pix_cnpj
        ) VALUES (
          :nome, :endereco, :cep, :logradouro, :numero, :complemento, :bairro, :cidade, :uf,
          :capacidade_total, :vagas_disponiveis, :vagas,
          :valor_hora, :preco_hora, :valor_diaria, :preco_dia, :valor_mensal,
          :latitude, :longitude, :descricao, :admin_id, :cnpj, :email, :telefone,
          :status, :horario_abertura, :horario_fechamento, :foto,
          :chave_pix, :tipo_chave_pix, :nome_titular_pix, :chave_pix_cnpj
        ) RETURNING id`,
        {
          replacements: dadosEstacionamento,
          type: db.sequelize.QueryTypes.INSERT,
          transaction
        }
      );
      
      if (!estacionamentoId || !estacionamentoId[0] || !estacionamentoId[0].id) {
        throw new Error('Falha ao criar estacionamento: ID não retornado');
      }
      
      const estacionamento = { id: estacionamentoId[0].id, ...dadosEstacionamento };
      
      logger.info('Estacionamento criado com sucesso', { estacionamentoId: estacionamento.id });
      
      // 8. Criar as vagas do estacionamento
      logger.info(`Criando ${numeroVagas} vagas para o estacionamento ${estacionamento.id}...`);
      
      const vagas = [];
      for (let i = 1; i <= numeroVagas; i++) {
        vagas.push({
          numero: i,
          status: 'livre',
          estacionamento_id: estacionamento.id,
          // Inicializar campos obrigatórios
          tipo_veiculo: 'padrao',
          entrada: null,
          tempo_estacionado: 0,
          usuario_id: null,
          reserva_id_ativa: null,
          placa: null
        });
      }
      
      await db.Vaga.bulkCreate(vagas, { 
        transaction,
        validate: true, // Validar os dados antes de inserir
        returning: true // Retornar os registros criados
      });
      
      logger.info(`${vagas.length} vagas criadas com sucesso`);
      
      // 9. Criar horários padrão de funcionamento usando o controlador
      await HorarioFuncionamentoController.criarPadroes(estacionamento.id, { transaction });
      
      // 10. Remover os dados do armazenamento temporário
      tempStorage.del(storageKey);
      
      // 11. Confirmar a transação
      await transaction.commit();
      
      // 10. Enviar email de confirmação (fora da transação)
      try {
        await sendConfirmationEmail(solicitacaoData, estacionamento.nome);
      } catch (emailError) {
        console.error('Erro ao enviar email de confirmação:', emailError);
        // Não falhar a operação principal se o email falhar
      }
      
      // 11. Redirecionar para página de sucesso com dados na query string
      const successUrl = `/approval-success.html?` +
        `nome=${encodeURIComponent(estacionamento.nome)}` +
        `&cnpj=${encodeURIComponent(solicitacaoData.cnpj)}` +
        `&estId=${estacionamento.id}` +
        `&email=${encodeURIComponent(solicitacaoData.email)}` +
        `&adminId=${adminId}`;
      
      return res.redirect(successUrl);
      
    } catch (error) {
      // Rollback em caso de erro
      if (transaction) {
        try {
          logger.error('Erro na transação, realizando rollback...', { 
            error: error.message,
            stack: error.stack 
          });
          await transaction.rollback();
        } catch (rollbackError) {
          logger.error('Erro ao fazer rollback da transação:', {
            rollbackError: rollbackError.message,
            originalError: error.message
          });
        }
      }
      
      logger.error('Erro ao processar aprovação:', error);
      
      // Tratar erros específicos
      if (error.name === 'SequelizeUniqueConstraintError') {
        let field = 'dados';
        if (error.fields && error.fields.email) field = 'email';
        else if (error.fields && error.fields.cnpj) field = 'CNPJ';
        
        return res.status(409).json({
          success: false,
          error: 'Conflito de Dados',
          message: `O ${field} informado já está em uso.`
        });
      }
      
      // Se for um erro de validação do AppError, retornar mensagem personalizada
      if (error instanceof AppError) {
        return res.status(error.statusCode || 500).json({
          success: false,
          error: error.name || 'Erro no Processamento',
          message: error.message
        });
      }
      
      // Erro genérico
      return res.status(500).json({
        success: false,
        error: 'Erro no Processamento',
        message: error.message || 'Ocorreu um erro ao processar a aprovação.'
      });
    }
  } catch (error) {
    console.error('Erro inesperado ao processar aprovação:', error);
    clearTimeout(requestTimeout);
    return res.status(500).json({
      success: false,
      error: 'Erro Interno',
      message: 'Ocorreu um erro inesperado ao processar sua solicitação.'
    });
  }
};

/**
 * Rejeita uma solicitação de parceria via token
 */
exports.rejectPartner = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Buscar dados da solicitação no armazenamento temporário
    const storageKey = `${TOKEN_PREFIX}${token}`;
    let solicitacaoData = null;
    
    try {
      // Tenta obter os dados do armazenamento temporário
      solicitacaoData = tempStorage.get(storageKey);
      
      // Se encontrou, remove do armazenamento (uso único)
      if (solicitacaoData) {
        tempStorage.del(storageKey);
        console.log('Dados da solicitação recuperados para rejeição');
      } else {
        console.log('Solicitação não encontrada ou expirada para o token (rejeição):', token);
        return res.status(404).render('approval-error', {
          title: 'Token Inválido ou Expirado',
          message: 'O link de rejeição é inválido ou expirou. Por favor, peça ao solicitante para enviar uma nova solicitação.'
        });
      }
    } catch (error) {
      console.error('Erro ao processar o token de rejeição:', error);
      return res.status(500).render('approval-error', {
        title: 'Erro Interno',
        message: 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente mais tarde.'
      });
    }
    
    // Enviar e-mail de rejeição para o solicitante
    const rejectionMail = {
      from: `"ParkNow" <${config.email.auth.user}>`,
      to: solicitacaoData.email,
      subject: 'Atualização sobre sua solicitação de parceria - ParkNow',
      // Adicionar cabeçalhos para melhorar a entrega
      headers: {
        ...emailConfig.headers,
        'X-Template': 'partner-rejection',
        'X-Tracking-ID': `reject-${Date.now()}`
      },
      // Prioridade alta
      priority: 'high',
      // Formatação
      encoding: 'utf-8',
      textEncoding: 'quoted-printable',
      // Rastreamento de entrega
      dsn: {
        id: `reject-${Date.now()}`,
        return: 'headers',
        notify: ['failure', 'delay'],
        recipient: config.email.admin
      },
      // Conteúdo HTML formatado
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Resposta da Solicitação</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #004080; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
            .footer { margin-top: 30px; font-size: 12px; color: #777; text-align: center; }
            .highlight { color: #004080; font-weight: bold; }
            a { color: #0066cc; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Solicitação de Parceria - ParkNow</h1>
          </div>
          
          <div class="content">
            <p>Olá <span class="highlight">${solicitacaoData.nome}</span>,</p>
            
            <p>Agradecemos pelo seu interesse em se tornar um parceiro ParkNow.</p>
            
            <p>Após análise, lamentamos informar que não poderemos aprovar sua solicitação de parceria no momento.</p>
            
            <p>Se você acredita que houve algum engano ou gostaria de mais informações, por favor, entre em contato conosco através do email: <a href="mailto:${config.email.support}">${config.email.support}</a></p>
            
            <p>Agradecemos sua compreensão e desejamos sucesso em seus empreendimentos.</p>
            
            <p>Atenciosamente,<br>Equipe ParkNow</p>
            
            <div class="footer">
              <p>Esta é uma mensagem automática. Por favor, não responda a este e-mail.</p>
              <p>Para cancelar o recebimento de nossas mensagens, <a href="${config.baseUrl || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(solicitacaoData.email)}">clique aqui</a>.</p>
              <p>&copy; ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Versão em texto puro para clientes de e-mail que não suportam HTML
      text: `Olá ${solicitacaoData.nome},

Agradecemos pelo seu interesse em se tornar um parceiro ParkNow.

Após análise, lamentamos informar que não poderemos aprovar sua solicitação de parceria no momento.

Se você acredita que houve algum engano ou gostaria de mais informações, entre em contato conosco através do email: ${config.email.support}

Agradecemos sua compreensão e desejamos sucesso em seus empreendimentos.

Atenciosamente,
Equipe ParkNow

---
Esta é uma mensagem automática. Por favor, não responda a este e-mail.
Para cancelar o recebimento de nossas mensagens, acesse: ${config.baseUrl || 'http://localhost:3000'}/unsubscribe?email=${encodeURIComponent(solicitacaoData.email)}
© ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.`
    };
    
    try {
      // Usar a função sendEmail que criamos anteriormente
      await sendEmail(rejectionMail);
      console.log('Email de rejeição enviado com sucesso para:', solicitacaoData.email);
    } catch (emailError) {
      console.error('Erro ao enviar email de rejeição:', emailError);
      // Continuar mesmo se o email falhar, mas registrar o erro
      console.error('Detalhes do erro:', emailError.response ? emailError.response : emailError.message);
    }
    
    // Renderizar página de confirmação de rejeição
    return res.status(200).render('approval-rejection', {
      title: 'Solicitação Rejeitada',
      estacionamento: solicitacaoData.nomeEstacionamento,
      parceiro: solicitacaoData.nome
    });
    
  } catch (error) {
    console.error('Erro ao processar rejeição de parceria:', error);
    return res.status(500).render('approval-error', {
      title: 'Erro Interno',
      message: 'Ocorreu um erro ao processar a solicitação. Por favor, tente novamente mais tarde.'
    });
  }
};
