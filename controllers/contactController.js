// controllers/contactController.js
const config = require('../config');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const _db = require('../config/db');
const tempStorage = require('../utils/tempStorage');
const juice = require('juice');
const path = require('path');
const _fs = require('fs');

// Configuração
const TOKEN_PREFIX = 'parceria:';
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000; // 24 horas

// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

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
      console.log('Erro ao enviar email:', emailError);
      // Continue com a execução mesmo se o email falhar
    }

    // Responder ao cliente
    return res.status(200).json({
      success: true,
      message: 'Mensagem enviada com sucesso! Em breve entraremos em contato.'
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem de contato:', error);
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
    console.log('Nova inscrição na newsletter:', newsletterData);

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
      console.log('Erro ao enviar email de newsletter:', emailError);
      // Continue com a execução mesmo se o email falhar
    }

    // Responder ao cliente
    return res.status(201).json({
      success: true,
      message: 'Inscrição realizada com sucesso! Enviamos um email de confirmação.'
    });
  } catch (error) {
    console.error('Erro ao inscrever na newsletter:', error);
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
    console.log('Recebida solicitação de parceria:', req.body);
    
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
      tempStorage.set(storageKey, dadosSolicitacao, TOKEN_EXPIRATION);
      console.log(`Solicitação de parceria armazenada com token: ${approvalToken}`);
    } catch (error) {
      console.error('Erro ao armazenar solicitação de parceria:', error);
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
    const textVersion = `Nova Solicitação de Parceria: ${nomeEstacionamento}
    
    Olá, equipe ParkNow!
    
    Uma nova solicitação de parceria foi recebida. Por favor, acesse o painel administrativo para revisar os detalhes.
    
    DETALHES DA SOLICITAÇÃO
    -------------------------
    Nome do Estacionamento: ${nomeEstacionamento}
    Responsável: ${nome}
    Email: ${email}
    CNPJ: ${cnpj || 'Não informado'}
    Endereço: ${enderecoEstacionamento || 'Não informado'}
    Cidade/UF: ${cidadeEstacionamento || 'Cidade'}/${ufEstacionamento || 'UF'}
    Vagas: ${numeroVagas || 'Não informado'}
    Horário de Funcionamento: ${horarioAbertura || 'Não informado'} às ${horarioFechamento || 'Não informado'}
    Preço por Hora: R$ ${parseFloat(precoHora || 0).toFixed(2).replace('.', ',')}
    Preço por Dia: R$ ${parseFloat(precoDia || 0).toFixed(2).replace('.', ',')}
    
    ${(latitude && longitude) ? `Localização: https://www.google.com/maps?q=${latitude},${longitude}\n` : ''}
    -------------------------
    
    AÇÕES RÁPIDAS
    - Aprovar: ${approvalUrl}
    - Rejeitar: ${rejectionUrl}
    
    Esta é uma mensagem automática, por favor não responda este e-mail.
    `;

    const mailOptions = {
      from: `"ParkNow - Parcerias" <${config.email.from.split('<')[1].replace('>', '')}`,
      to: config.email.admin || config.email.user,
      subject: `🚀 Nova Solicitação de Parceria: ${nomeEstacionamento}`,
      text: textVersion,
      html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>Nova Solicitação de Parceria - ParkNow</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          /* Reset e Estilos Base */
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
            font-family: 'Poppins', 'Montserrat', Arial, sans-serif; 
          }
          
          body { 
            background-color: #f8fafc; 
            color: #1e293b; 
            line-height: 1.7; 
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          
          /* Container Principal */
          .email-container {
            max-width: 700px; 
            margin: 20px auto; 
            background: #ffffff; 
            border-radius: 16px; 
            overflow: hidden;
            box-shadow: 0 10px 50px rgba(0, 0, 0, 0.08);
            border: 1px solid #e2e8f0;
          }
          
          /* Cabeçalho */
          .email-header {
            background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
            color: white; 
            padding: 50px 30px 80px; 
            position: relative;
            overflow: hidden;
            text-align: center;
            border-bottom: 6px solid #1e40af;
          }
          
          .logo-container {
            margin-bottom: 25px;
            position: relative;
            z-index: 2;
          }
          
          .logo {
            max-width: 180px;
            height: auto;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
          }
          
          .header-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(5px);
            padding: 10px 20px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-bottom: 15px;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .header-title {
            font-size: 28px;
            font-weight: 700;
            margin: 15px 0;
            line-height: 1.3;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          
          .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            max-width: 500px;
            margin: 0 auto;
            font-weight: 400;
          }
          
          /* Efeitos de Fundo */
          .header-shape {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
          }
          
          .shape-1 {
            width: 300px;
            height: 300px;
            top: -100px;
            right: -100px;
            animation: float 15s infinite ease-in-out;
          }
          
          .shape-2 {
            width: 200px;
            height: 200px;
            bottom: -80px;
            left: -80px;
            animation: float 12s infinite ease-in-out reverse;
          }
          
          @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(5deg); }
          }
          
          /* Conteúdo Principal */
          .email-body {
            padding: 50px 40px;
            position: relative;
            z-index: 2;
          }
          
          .card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.03);
            border: 1px solid #e2e8f0;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          
          .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          }
          
          .section-title {
            font-size: 20px;
            color: #1e40af;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            font-weight: 600;
          }
          
          .section-title i {
            margin-right: 10px;
            color: #3b82f6;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }
          
          .info-item {
            display: flex;
            margin-bottom: 15px;
          }
          
          .info-icon {
            width: 40px;
            height: 40px;
            background: #e0f2fe;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            color: #0369a1;
            flex-shrink: 0;
          }
          
          .info-content h4 {
            font-size: 15px;
            color: #64748b;
            margin-bottom: 3px;
            font-weight: 500;
          }
          
          .info-content p {
            font-size: 16px;
            color: #1e293b;
            font-weight: 500;
            line-height: 1.4;
          }
          
          /* Botões de Ação */
          .action-buttons {
            display: flex;
            justify-content: center;
            gap: 16px;
            margin: 40px 0 30px;
            flex-wrap: wrap;
          }
          
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            text-decoration: none;
            font-size: 15px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: center;
            border: none;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            min-width: 200px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
          
          .btn i {
            margin-right: 10px;
            font-size: 16px;
            transition: transform 0.3s ease;
          }
          
          .btn-approve {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
            position: relative;
            z-index: 1;
          }
          
          .btn-approve::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: -1;
          }
          
          .btn-approve:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
          }
          
          .btn-approve:hover::before {
            opacity: 1;
          }
          
          .btn-approve:hover i {
            transform: translateX(3px);
          }
          
          .btn-reject {
            background: white;
            color: #dc2626;
            border: 1px solid #fecaca;
            position: relative;
            z-index: 1;
            transition: all 0.3s ease;
          }
          
          .btn-reject::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #fef2f2;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: -1;
          }
          
          .btn-reject:hover {
            background: #fef2f2;
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(239, 68, 68, 0.1);
            border-color: #fca5a5;
          }
          
          .btn-reject:hover::before {
            opacity: 1;
          }
          
          .btn-reject:hover i {
            transform: translateX(3px);
          }
          
          /* Rodapé */
          .email-footer {
            background: #1e293b;
            padding: 40px 30px 30px;
            text-align: center;
            color: #e2e8f0;
            position: relative;
            overflow: hidden;
          }
          
          .email-footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          }
          
          .footer-logo {
            max-width: 120px;
            width: 120px;
            height: auto;
            max-width: 140px;
            margin-bottom: 20px;
            filter: brightness(0) invert(1) opacity(0.9);
          }
          
          .footer-text {
            max-width: 500px;
            margin: 0 auto 20px;
            font-size: 14px;
            line-height: 1.7;
            color: #94a3b8;
          }
          
          .social-links {
            margin: 25px 0;
            display: flex;
            justify-content: center;
            gap: 12px;
          }
          
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }
          
          .social-links a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            background: rgba(255, 255, 255, 0.05);
            color: #e2e8f0;
            border-radius: 10px;
            text-decoration: none;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 16px;
          }
          
          .social-links a:hover {
            background: #3b82f6;
            color: white;
            transform: translateY(-3px);
            box-shadow: 0 5px 15px rgba(59, 130, 246, 0.3);
            border-color: transparent;
          }
          
          .footer-links {
            margin: 25px 0;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 15px;
          }
          
          .footer-links a {
            color: #cbd5e1;
            text-decoration: none;
            font-size: 13px;
            transition: all 0.2s ease;
            padding: 5px 10px;
            border-radius: 4px;
          }
          
          .footer-links a:hover {
            color: #3b82f6;
            background: rgba(59, 130, 246, 0.1);
          }
          
          .copyright {
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.6;
          }
          
          .footer-shape {
            position: absolute;
            opacity: 0.05;
            pointer-events: none;
          }
          
          .footer-shape-1 {
            top: 20%;
            left: 10%;
            font-size: 100px;
          }
          
          .footer-shape-2 {
            bottom: 10%;
            right: 10%;
            font-size: 80px;
            transform: rotate(30deg);
          }
          
          /* Responsividade */
          @media (max-width: 600px) {
            .email-body {
              padding: 30px 20px;
            }
            
            .card {
              padding: 20px;
            }
            
            .action-buttons {
              flex-direction: column;
              gap: 12px;
            }
            
            .btn {
              width: 100%;
              padding: 14px 20px;
            }
            
            .info-grid {
              grid-template-columns: 1fr;
            }
          }
          
          /* Reset e Estilos Base */
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
            font-family: 'Poppins', 'Montserrat', Arial, sans-serif; 
          }
          
          body { 
            background-color: #f8fafc; 
            color: #1e293b; 
            line-height: 1.7; 
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          
          /* Container Principal */
          .email-container {
            max-width: 700px; 
            margin: 20px auto; 
            background: #ffffff; 
            border-radius: 16px; 
            overflow: hidden;
            box-shadow: 0 10px 50px rgba(0, 0, 0, 0.08);
            border: 1px solid #e2e8f0;
          }
          
          /* Cabeçalho */
          .email-header {
            background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
            color: white; 
            padding: 50px 30px 80px; 
            position: relative;
            overflow: hidden;
            text-align: center;
            border-bottom: 6px solid #1e40af;
          }
          
          .logo-container {
            margin-bottom: 25px;
            position: relative;
            z-index: 2;
          }
          
          .logo {
            max-width: 180px;
            height: auto;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
          }
          
          .header-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(5px);
            padding: 10px 20px;
            border-radius: 50px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-bottom: 15px;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .header-title {
            font-size: 28px;
            font-weight: 700;
            margin: 15px 0;
            line-height: 1.3;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          
          .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            max-width: 500px;
            margin: 0 auto;
            font-weight: 400;
          }
          
          /* Efeitos de Fundo */
          .header-shape {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
          }
          
          .shape-1 {
            width: 300px;
            height: 300px;
            top: -100px;
            right: -100px;
            animation: float 15s infinite ease-in-out;
          }
          
          .shape-2 {
            width: 200px;
            height: 200px;
            bottom: -80px;
            left: -80px;
            animation: float 12s infinite ease-in-out reverse;
          }
          
          @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(5deg); }
          }
          
          /* Conteúdo Principal */
          .email-body {
            padding: 50px 40px;
            position: relative;
            z-index: 2;
          }
          
          .card {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.03);
            border: 1px solid #e2e8f0;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          
          .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          }
          
          .welcome-section {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
            border: 1px solid #e2e8f0;
          }
          
          .welcome-title {
            font-size: 24px;
            color: #1e40af;
            margin-bottom: 15px;
            font-weight: 700;
          }
          
          .welcome-text {
            color: #4b5563;
            margin-bottom: 25px;
            line-height: 1.7;
            font-size: 15px;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
          }
          
          /* Estatísticas */
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin: 30px 0;
          }
          
          .stat-card {
            background: white;
            border-radius: 12px;
            padding: 25px 15px;
            text-align: center;
            transition: all 0.3s ease;
            border: 1px solid #e2e8f0;
            position: relative;
            overflow: hidden;
          }
          
          .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 4px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
          }
          
          .stat-card:nth-child(2)::before {
            background: linear-gradient(90deg, #10b981, #3b82f6);
          }
          
          .stat-card:nth-child(3)::before {
            background: linear-gradient(90deg, #8b5cf6, #ec4899);
          }
          
          .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          }
          
          .stat-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
            color: white;
            font-size: 20px;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
          }
          
          .stat-card:nth-child(2) .stat-icon {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
          }
          
          .stat-card:nth-child(3) .stat-icon {
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
          }
          
          .stat-value {
            font-size: 22px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 5px;
            font-family: 'Montserrat', sans-serif;
          }
          
          .stat-label {
            font-size: 13px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
          }
          
          /* Seções de Dados */
          .data-section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 25px;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }
          
          .data-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
          }
          
          .data-section:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          }
          
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
          }
          
          .section-title i {
            margin-right: 10px;
            color: #3b82f6;
            font-size: 20px;
          }
          
          .data-row {
            display: flex;
            margin-bottom: 15px;
            padding: 10px 0;
            border-bottom: 1px dashed #f1f5f9;
            transition: all 0.2s ease;
          }
          
          .data-row:hover {
            background: #f8fafc;
            border-radius: 6px;
            padding: 10px;
          }
          
          .data-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
          }
          
          .data-label {
            width: 200px;
            font-weight: 600;
            color: #4b5563;
            font-size: 14px;
            display: flex;
            align-items: center;
          }
          
          .data-label i {
            margin-right: 8px;
            color: #64748b;
            font-size: 14px;
            width: 20px;
            text-align: center;
          }
          
          .data-value {
            flex: 1;
            color: #1f2937;
            font-size: 14px;
            font-weight: 500;
          }
          
          .highlight {
            background: #eff6ff;
            padding: 6px 12px;
            border-radius: 6px;
            border-left: 3px solid #3b82f6;
            color: #1e40af;
            font-weight: 500;
            display: inline-block;
          }
          
          .action-buttons {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 40px 0 30px;
            flex-wrap: wrap;
          }
          
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            text-decoration: none;
            font-size: 15px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            text-align: center;
            border: none;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            min-width: 200px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
          
          .data-section {
            background: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 25px;
            border: 1px solid #e2e8f0;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
          }
          
          .data-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
          }
          
          .data-section:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          }
          
          .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
          }
          
          .section-title i {
            margin-right: 10px;
            color: #3b82f6;
            font-size: 20px;
          }
          
          .data-row {
            display: flex;
            margin-bottom: 15px;
            padding: 10px 0;
            border-bottom: 1px dashed #f1f5f9;
            transition: all 0.2s ease;
          }
          
          .data-row:hover {
            background: #f8fafc;
            border-radius: 6px;
            padding: 10px;
          }
          
          .data-label {
            width: 200px;
            font-weight: 600;
            color: #4b5563;
            font-size: 14px;
            display: flex;
            align-items: center;
          }
          
          .data-label i {
            margin-right: 8px;
            color: #64748b;
            font-size: 14px;
            width: 20px;
            text-align: center;
          }
          
          .data-value {
            flex: 1;
            color: #1f2937;
            font-size: 14px;
            font-weight: 500;
          }
          
          .highlight {
            background: #eff6ff;
            padding: 6px 12px;
            border-radius: 6px;
            border-left: 3px solid #3b82f6;
            color: #1e40af;
            font-weight: 500;
            display: inline-block;
          }
          
          .warning-box {
            background: #fff8e6;
            border-left: 4px solid #ffc107;
            padding: 15px;
            border-radius: 4px;
            margin: 25px 0;
          }
          
          .warning-title {
            color: #d97706;
            margin-bottom: 8px;
            font-size: 16px;
            display: flex;
            align-items: center;
          }
          
          .warning-title i {
            margin-right: 8px;
          }
          
          .warning-text {
            color: #92400e;
            font-size: 14px;
            line-height: 1.5;
          }
          
          .email-footer {
            background: #1e293b;
            padding: 40px 30px 30px;
            text-align: center;
            color: #e2e8f0;
            position: relative;
            overflow: hidden;
            margin-top: 40px;
            border-radius: 0 0 16px 16px;
          }
          
          .email-footer img {
            max-width: 120px;
            height: auto;
            margin-bottom: 15px;
          }
          
          /* Estilos para o mapa */
          .map-preview {
            margin: 15px 0;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          
          .map-preview img {
            width: 100%;
            height: auto;
            display: block;
          }
          
          /* Estilos para dispositivos móveis */
          @media (max-width: 600px) {
            .data-row {
              flex-direction: column;
              gap: 5px;
            }
            
            .data-label {
              width: 100%;
              margin-bottom: 4px;
            }
            
            .action-buttons {
              flex-direction: column;
              gap: 12px;
            }
            
            .btn {
              width: 100%;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Cabeçalho -->
          <div class="email-header">
            <div class="logo-container">
              <img src="${logoUrl}" alt="ParkNow" class="logo">
            </div>
            <div class="header-badge">Nova Solicitação de Parceria</div>
            <h1 class="header-title">${nomeEstacionamento}</h1>
            <p class="header-subtitle">Uma nova solicitação de parceria foi enviada e aguarda sua análise.</p>
            
            <!-- Efeitos de fundo decorativos -->
            <div class="header-shape shape-1"></div>
            <div class="header-shape shape-2"></div>
          </div>
          
          <!-- Corpo do email -->
          <div class="email-body">
            <!-- Mensagem de boas-vindas -->
            <div class="welcome-section">
              <h2 class="welcome-title">Olá, equipe ParkNow!</h2>
              <p class="welcome-text">
                Uma nova solicitação de parceria foi recebida. Por favor, revise os detalhes abaixo e aprove ou rejeite a solicitação.
              </p>
            </div>
            
            <!-- Estatísticas Rápidas -->
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon">
                  <i class="fas fa-building"></i>
                </div>
                <div class="stat-value">1</div>
                <div class="stat-label">Estacionamento</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">
                  <i class="fas fa-car"></i>
                </div>
                <div class="stat-value">${numeroVagas || 'N/A'}</div>
                <div class="stat-label">Vagas</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">
                  <i class="fas fa-calendar-day"></i>
                </div>
                <div class="stat-value">${new Date().toLocaleDateString('pt-BR')}</div>
                <div class="stat-label">Data da Solicitação</div>
              </div>
            </div>
            
            <!-- Dados do Proprietário -->
            <div class="data-section">
              <h3 class="section-title"><i class="fas fa-user-tie"></i> Dados do Proprietário</h3>
              <div class="data-row">
                <div class="data-label"><i class="far fa-user"></i> Nome Completo:</div>
                <div class="data-value"><span class="highlight">${nome}</span></div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="far fa-envelope"></i> Email:</div>
                <div class="data-value">${email}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="far fa-id-card"></i> CNPJ:</div>
                <div class="data-value">${cnpj || 'Não informado'}</div>
              </div>
            </div>
            
            <!-- Dados do Estacionamento -->
            <div class="data-section">
              <h3 class="section-title"><i class="fas fa-parking"></i> Dados do Estacionamento</h3>
              <div class="data-row">
                <div class="data-label"><i class="fas fa-signature"></i> Nome:</div>
                <div class="data-value"><span class="highlight">${nomeEstacionamento}</span></div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="fas fa-map-marker-alt"></i> Endereço:</div>
                <div class="data-value">${enderecoEstacionamento || 'Não informado'}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="fas fa-city"></i> Cidade/UF:</div>
                <div class="data-value">${cidadeEstacionamento || 'Cidade'}/${ufEstacionamento || 'UF'}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="fas fa-car-side"></i> Vagas Disponíveis:</div>
                <div class="data-value">${numeroVagas || 'Não informado'}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="far fa-clock"></i> Preço por Hora:</div>
                <div class="data-value">R$ ${parseFloat(precoHora || 0).toFixed(2).replace('.', ',')}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="far fa-calendar-alt"></i> Preço por Dia:</div>
                <div class="data-value">R$ ${parseFloat(precoDia || 0).toFixed(2).replace('.', ',')}</div>
              </div>
              <div class="data-row">
                <div class="data-label"><i class="far fa-clock"></i> Horário de Funcionamento:</div>
                <div class="data-value">${horarioAbertura || 'Não informado'} às ${horarioFechamento || 'Não informado'}</div>
              </div>
              ${descricao ? `
              <div class="data-row">
                <div class="data-label"><i class="far fa-file-alt"></i> Descrição:</div>
                <div class="data-value">${descricao}</div>
              </div>` : ''}
            </div>
            
            <!-- Mapa (se houver coordenadas) -->
            ${(latitude && longitude) ? `
            <div class="data-section">
              <h3 class="section-title"><i class="fas fa-map-marked-alt"></i> Localização no Mapa</h3>
              <div class="map-preview">
                <a href="${googleMapsUrl}" target="_blank" style="display: block; text-decoration: none;">
                  <img 
                    src="https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=600&height=300&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};color:%23ff0000;size:medium&apiKey=${process.env.GEOAPIFY_API_KEY || 'YOUR_GEOAPIFY_KEY'}"
                    alt="Localização do estacionamento ${nomeEstacionamento} no mapa"
                    width="100%"
                    height="300"
                    style="border-radius: 8px; border: 1px solid #e2e8f0;"
                    loading="lazy"
                  >
                </a>
              </div>
              <p style="text-align: center; margin-top: 10px; font-size: 13px; color: #64748b;">
                <i class="fas fa-map-marker-alt"></i> Coordenadas: ${latitude}, ${longitude}
                <br>
                <a href="${googleMapsUrl}" target="_blank" style="color: #3b82f6; text-decoration: none;">
                  Ver localização no Google Maps <i class="fas fa-external-link-alt" style="font-size: 0.8em;"></i>
                </a>
              </p>
            </div>` : ''}
            
            <!-- Botões de Ação -->
            <div class="action-buttons">
              <a href="${approvalUrl}" class="btn btn-approve">
                <i class="fas fa-check-circle"></i> Aprovar Parceria
              </a>
              <a href="${rejectionUrl}" class="btn btn-reject">
                <i class="fas fa-times-circle"></i> Rejeitar Solicitação
              </a>
            </div>
            
            <!-- Aviso Importante -->
            <div class="warning-box">
              <h4 class="warning-title"><i class="fas fa-exclamation-triangle"></i> Importante</h4>
              <p class="warning-text">
                Esta solicitação expirará em 24 horas. Após a aprovação, o estacionamento será ativado imediatamente.
                Certifique-se de verificar todos os dados antes de aprovar.
              </p>
            </div>
          </div>
          
          <!-- Rodapé -->
          <div class="email-footer">
            <img src="${logoUrl}" alt="ParkNow" class="footer-logo">
            <p style="margin-top: 15px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
              Esta é uma mensagem automática, por favor não responda este e-mail.
            </p>
            <div class="social-links">
              <a href="#" target="_blank"><i class="fab fa-facebook-f"></i></a>
              <a href="#" target="_blank"><i class="fab fa-instagram"></i></a>
              <a href="#" target="_blank"><i class="fab fa-linkedin-in"></i></a>
              <a href="#" target="_blank"><i class="fab fa-twitter"></i></a>
            </div>
            <div class="footer-links">
              <a href="#" target="_blank">Termos de Uso</a>
              <a href="#" target="_blank">Política de Privacidade</a>
              <a href="#" target="_blank">Central de Ajuda</a>
              <a href="#" target="_blank">Contato</a>
            </div>
            <p class="copyright">
              &copy; ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.<br>
              Este e-mail foi enviado para ${config.email.admin || config.email.user}
            </p>
            <div class="footer-shape">
              <i class="fas fa-car"></i>
            </div>
            <div class="footer-shape footer-shape-2">
              <i class="fas fa-parking"></i>
            </div>
          </div>
        </div>
      </body>
      </html>
      `
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
      console.log('Email de solicitação enviado com sucesso');
    } catch (emailError) {
      console.error('Erro ao enviar email de solicitação:', emailError);
      // Continuar mesmo se o email falhar
    }
    
    // Construir o HTML de confirmação
    const confirmationHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmação de Solicitação - ParkNow</title>
      <style>
        /* Estilos inline para o email de confirmação */
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 0;
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          color: white;
          padding: 30px 20px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px;
        }
        .footer {
          text-align: center;
          padding: 20px;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #eee;
          background-color: #f8fafc;
        }
        .button {
          display: inline-block;
          padding: 12px 30px;
          background: #3b82f6;
          color: white !important;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 500;
          text-align: center;
        }
        .info-box {
          background: #f8fafc;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          margin: 20px 0;
          border-radius: 0 4px 4px 0;
        }
        .info-box p {
          margin: 5px 0;
          color: #334155;
        }
        .logo {
          max-width: 180px;
          margin-bottom: 15px;
        }
        @media only screen and (max-width: 600px) {
          .content {
            padding: 20px 15px;
          }
          .button {
            width: 100%;
            box-sizing: border-box;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="cid:logo@parknow.com.br" alt="ParkNow" class="logo">
          <h1>✅ Solicitação Recebida</h1>
        </div>
        <div class="content">
          <p>Olá ${nome},</p>
          <p>Sua solicitação de parceria para o estacionamento <strong>${nomeEstacionamento}</strong> foi recebida com sucesso!</p>
          
          <div class="info-box">
            <p><strong>Número da Solicitação:</strong> #${Date.now().toString().slice(-8)}</p>
            <p><strong>Data de Envio:</strong> ${new Date().toLocaleString('pt-BR')}</p>
            <p><strong>Status:</strong> <span style="color: #f59e0b; font-weight: 600;">Em Análise</span></p>
          </div>
          
          <p>Nossa equipe irá analisar os dados fornecidos e você receberá uma resposta em até 48 horas úteis.</p>
          
          <p>Aqui está um resumo das informações enviadas:</p>
          <ul style="padding-left: 20px; margin: 15px 0;">
            <li style="margin-bottom: 8px;"><strong>CNPJ:</strong> ${cnpj || 'Não informado'}</li>
            <li style="margin-bottom: 8px;"><strong>Endereço:</strong> ${enderecoEstacionamento || 'Não informado'}</li>
            <li style="margin-bottom: 8px;"><strong>Vagas:</strong> ${numeroVagas || 'Não informado'}</li>
            <li style="margin-bottom: 8px;"><strong>Preço por Hora:</strong> R$ ${parseFloat(precoHora || 0).toFixed(2).replace('.', ',')}</li>
            <li><strong>Preço por Dia:</strong> R$ ${parseFloat(precoDia || 0).toFixed(2).replace('.', ',')}</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${baseUrl}/minha-conta/solicitacoes" class="button">
              Acompanhar Solicitação
            </a>
          </div>
          
          <p>Se precisar de alguma alteração ou tiver alguma dúvida, entre em contato conosco pelo email <a href="mailto:suporte@parknow.com.br" style="color: #3b82f6; text-decoration: none;">suporte@parknow.com.br</a>.</p>
          
          <p>Atenciosamente,<br><strong>Equipe ParkNow</strong></p>
        </div>
        <div class="footer">
          <p>Este é um e-mail automático, por favor não responda esta mensagem.</p>
          <p>© ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.</p>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 15px;">
            Se você não reconhece esta atividade, por favor entre em contato conosco em 
            <a href="mailto:seguranca@parknow.com.br" style="color: #3b82f6; text-decoration: none;">seguranca@parknow.com.br</a>
          </p>
        </div>
      </div>
    </body>
    </html>`;

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
      console.log('Email de confirmação enviado com sucesso');
    } catch (emailError) {
      console.error('Erro ao enviar email de confirmação:', emailError);
      // Continuar mesmo se o email falhar
    }
    
    // Enviar email para a equipe administrativa
    try {
      await transporter.sendMail(mailOptions);
      console.log('Email para a equipe administrativa enviado com sucesso');
      
      // Responder ao cliente
      return res.status(200).json({
        status: 'success',
        message: 'Solicitação de parceria enviada com sucesso! Em breve entraremos em contato.'
      });
      
    } catch (adminEmailError) {
      console.error('Erro ao enviar email para a equipe administrativa:', adminEmailError);
      throw new Error('Falha ao enviar email para a equipe administrativa');
    }
  } catch (error) {
    console.error('Erro ao processar solicitação de parceria:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Erro ao processar solicitação. Por favor, tente novamente mais tarde.'
    });
  }
};
