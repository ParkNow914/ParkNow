// controllers/contactController.js
const config = require('../config');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const _db = require('../config/db');
const tempStorage = require('../utils/tempStorage');
const juice = require('juice');
const {
  buildParceriaTextEmail,
  buildParceriaHtmlEmail,
  buildParceriaConfirmationHtml,
} = require('../services/parceriaEmailTemplates');
const path = require('path');
const _fs = require('fs');

// Configuração
const TOKEN_PREFIX = 'parceria:';
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Controlador para gerenciar mensagens de contato e inscrições de newsletter
 */

// Configuração do transporte de email (ajuste conforme suas configurações)
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.auth.user,
    pass: config.email.auth.pass
  }
});

/**
 * Envia uma mensagem de contato
 */
exports.sendContactMessage = async (req, res, next) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ 
        success: false, 
        message: 'Erro de validação', 
        errors: errors.array() 
      });
    }

    const { nome, email, assunto, mensagem } = req.body;

    // Enviar email para a equipe de suporte
    const mailOptions = {
      from: config.email.from,
      to: config.email.support, // Email de suporte configurado
      subject: `Contato via Site: ${assunto}`,
      html: `
        <h2>Nova mensagem de contato</h2>
        <p><strong>Nome:</strong> ${nome}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Assunto:</strong> ${assunto}</p>
        <p><strong>Mensagem:</strong></p>
        <p>${mensagem.replace(/\n/g, '<br>')}</p>
      `
    };

    try {
      // Enviar email
      await transporter.sendMail(mailOptions);

      // Enviar email de confirmação para o usuário
      const confirmationMail = {
        from: config.email.from,
        to: email,
        subject: 'Recebemos sua mensagem - ParkNow',
        html: `
          <h2>Olá ${nome},</h2>
          <p>Recebemos sua mensagem e agradecemos pelo contato.</p>
          <p>Um membro da nossa equipe irá analisar e responder o mais breve possível.</p>
          <p>Atenciosamente,<br>Equipe ParkNow</p>
        `
      };

      await transporter.sendMail(confirmationMail);
    } catch (emailError) {
      logger.info('Erro ao enviar email:', emailError);
      // Continue com a execução mesmo se o email falhar
    }

    // Responder ao cliente
    return res.status(200).json({
      success: true,
      message: 'Mensagem enviada com sucesso! Em breve entraremos em contato.'
    });
  } catch (error) {
    logger.error('Erro ao enviar mensagem de contato:', error);
    return next(new AppError('Erro ao enviar mensagem. Por favor, tente novamente mais tarde.', 500));
  }
};

/**
 * Inscreve um email na newsletter
 */
exports.subscribeNewsletter = async (req, res, next) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ 
        success: false, 
        message: 'Erro de validação', 
        errors: errors.array() 
      });
    }

    const { email, nome } = req.body;
    
    // Em uma implementação real, você verificaria se o email já está inscrito
    // e salvaria em um banco de dados permanente
    // Como o Redis está desabilitado neste projeto, vamos simular este comportamento
    
    // Simula armazenamento da inscrição
    const newsletterData = {
      email,
      nome: nome || '',
      date: new Date().toISOString()
    };
    
    // Registra a inscrição no log (já que não podemos salvar no Redis)
    logger.info('Nova inscrição na newsletter:', newsletterData);

    // Enviar email de confirmação
    const mailOptions = {
      from: config.email.from,
      to: email,
      subject: 'Bem-vindo à Newsletter ParkNow',
      html: `
        <h2>Olá ${nome || 'Usuário'},</h2>
        <p>Obrigado por se inscrever em nossa newsletter!</p>
        <p>Você receberá novidades, promoções e informações exclusivas sobre o ParkNow.</p>
        <p>Atenciosamente,<br>Equipe ParkNow</p>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      logger.info('Erro ao enviar email de newsletter:', emailError);
      // Continue com a execução mesmo se o email falhar
    }

    // Responder ao cliente
    return res.status(201).json({
      success: true,
      message: 'Inscrição realizada com sucesso! Enviamos um email de confirmação.'
    });
  } catch (error) {
    logger.error('Erro ao inscrever na newsletter:', error);
    return next(new AppError('Erro ao processar inscrição. Por favor, tente novamente mais tarde.', 500));
  }
};

/**
 * Processa solicitação de parceria com o ParkNow
 * Envia um email estilizado para a equipe de análise com todos os dados do estacionamento
 * e um botão para aprovar automaticamente o cadastro
 */
exports.solicitarParceria = async (req, res, _next) => {
  try {
    logger.info('Recebida solicitação de parceria', { nomeEstacionamento: req.body?.nomeEstacionamento });
    
    // Extrair dados da solicitação
    const {
      nome, // Nome do responsável
      email,
      telefone,
      senha,
      cnpj,
      nomeEstacionamento,
      _cepEstacionamento,
      _logradouroEstacionamento,
      _numeroEstacionamento,
      _bairroEstacionamento,
      cidadeEstacionamento,
      ufEstacionamento,
      enderecoEstacionamento,
      latitude,
      longitude,
      numeroVagas,
      precoHora,
      precoDia,
      tipoChavePix,
      chavePix,
      nomeTitularPix,
      descricao,
      horarioAbertura,
      horarioFechamento,
      fotoEstacionamento,
      fotoEstacionamentoNome
    } = req.body;
    
    // Gerar token único para aprovação
    const approvalToken = crypto.randomBytes(32).toString('hex');
    // Definir expiração do token (24 horas a partir de agora)
    const tokenExpiracao = new Date();
    tokenExpiracao.setHours(tokenExpiracao.getHours() + 24);
    
    // Preparar dados da solicitação
    const dadosSolicitacao = {
      nome,
      email,
      telefone,
      senha, // Em produção, não armazenar senha em texto puro
      cnpj,
      nomeEstacionamento,
      enderecoEstacionamento,
      latitude,
      longitude,
      numeroVagas,
      precoHora,
      precoDia,
      tipoChavePix,
      chavePix,
      nomeTitularPix,
      descricao,
      horarioAbertura,
      horarioFechamento,
      fotoEstacionamento,
      fotoEstacionamentoNome,
      dataSolicitacao: new Date().toISOString(),
      tokenExpiracao: new Date(tokenExpiracao).toISOString()
    };
    
    // Armazenar no sistema de armazenamento temporário
    try {
      const storageKey = `${TOKEN_PREFIX}${approvalToken}`;
      await tempStorage.set(storageKey, dadosSolicitacao, TOKEN_EXPIRATION);
      logger.info(`Solicitação de parceria armazenada com token: ${approvalToken}`);
    } catch (error) {
      logger.error('Erro ao armazenar solicitação de parceria:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro ao processar sua solicitação. Por favor, tente novamente.'
      });
    }
    
    // Construir URLs de aprovação e reprovação
    const baseUrl = req.protocol + '://' + req.get('host');
    const apiBaseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.parknow.com.br' 
      : baseUrl;
      
    const approvalUrl = `${apiBaseUrl}/api/public/approve-partner/${approvalToken}`;
    const rejectionUrl = `${apiBaseUrl}/api/public/reject-partner/${approvalToken}`;
    
    // URL para o Google Maps (se houver coordenadas)
    const googleMapsUrl = (latitude && longitude) 
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

    // Configurar o email
    const logoUrl = `${baseUrl}/img/logo.png`;
    const _currentDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    // Versão em texto simples do e-mail
    // Dados passados aos builders de template (services/parceriaEmailTemplates.js)
    const templateData = {
      nome, email, cnpj, nomeEstacionamento, enderecoEstacionamento,
      cidadeEstacionamento, ufEstacionamento, numeroVagas, precoHora, precoDia,
      horarioAbertura, horarioFechamento, latitude, longitude, descricao,
      approvalUrl, rejectionUrl, googleMapsUrl, logoUrl, baseUrl,
    };
    const textVersion = buildParceriaTextEmail(templateData);

    const mailOptions = {
      from: `"ParkNow - Parcerias" <${config.email.from.split('<')[1].replace('>', '')}`,
      to: config.email.admin || config.email.user,
      subject: `🚀 Nova Solicitação de Parceria: ${nomeEstacionamento}`,
      text: textVersion,
      html: buildParceriaHtmlEmail(templateData)
    };
    
    // Processar o HTML com juice para inlinar os estilos
    const htmlWithInlineStyles = juice(mailOptions.html, {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve(__dirname, '..', 'public'),
        images: true,
        svgs: true,
        links: true
      }
    });

    // Atualizar o HTML com os estilos inline
    mailOptions.html = htmlWithInlineStyles;

    // Enviar email para a equipe de análise
    try {
      await transporter.sendMail(mailOptions);
      logger.info('Email de solicitação enviado com sucesso');
    } catch (emailError) {
      logger.error('Erro ao enviar email de solicitação:', emailError);
      // Continuar mesmo se o email falhar
    }
    
    // Construir o HTML de confirmação
    const confirmationHtml = buildParceriaConfirmationHtml(templateData);

    // Processar o HTML de confirmação com juice para inlinar os estilos
    const confirmationWithInlineStyles = juice(confirmationHtml, {
      preserveImportant: true,
      webResources: {
        relativeTo: path.resolve(__dirname, '..', 'public'),
        images: true,
        svgs: true,
        links: true
      }
    });

    // Caminho para a logo
    const logoPath = path.join(__dirname, '..', 'public', 'img', 'logo.png');

    // Enviar email de confirmação para o solicitante
    const confirmationMail = {
      from: `"ParkNow - Sistema de Parcerias" <${config.email.user}>`,
      to: email,
      subject: `✅ Recebemos sua solicitação de parceria - ${nomeEstacionamento}`,
      html: confirmationWithInlineStyles,
      attachments: [
        {
          filename: 'logo.png',
          path: logoPath,
          cid: 'logo@parknow.com.br'
        }
      ]
    };
    
    // Adicionar a logo como anexo ao email principal também
    mailOptions.attachments = mailOptions.attachments || [];
    mailOptions.attachments.push({
      filename: 'logo.png',
      path: logoPath,
      cid: 'logo@parknow.com.br'
    });

    // Enviar email de confirmação
    try {
      await transporter.sendMail(confirmationMail);
      logger.info('Email de confirmação enviado com sucesso');
    } catch (emailError) {
      logger.error('Erro ao enviar email de confirmação:', emailError);
      // Continuar mesmo se o email falhar
    }
    
    // Enviar email para a equipe administrativa
    try {
      await transporter.sendMail(mailOptions);
      logger.info('Email para a equipe administrativa enviado com sucesso');
      
      // Responder ao cliente
      return res.status(200).json({
        status: 'success',
        message: 'Solicitação de parceria enviada com sucesso! Em breve entraremos em contato.'
      });
      
    } catch (adminEmailError) {
      logger.error('Erro ao enviar email para a equipe administrativa:', adminEmailError);
      throw new Error('Falha ao enviar email para a equipe administrativa');
    }
  } catch (error) {
    logger.error('Erro ao processar solicitação de parceria:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao processar solicitação. Por favor, tente novamente mais tarde.'
    });
  }
};
