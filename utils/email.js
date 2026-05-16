const nodemailer = require('nodemailer');
const pug = require('pug');
const { htmlToText } = require('html-to-text');
const path = require('path');
const _config = require('../config');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.nome.split(' ')[0];
    this.url = url;
    this.from = `ParkNow <${process.env.EMAIL_FROM}>`;
  }

  // Criar um transporte de email otimizado
  newTransport() {
    // Configurações comuns para todos os ambientes
    const baseConfig = {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false, // false para porta 587, true para 465
      requireTLS: true,
      tls: {
        rejectUnauthorized: false
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
      auth: {
        user: process.env.EMAIL_USER || process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD,
      },
      // Headers padrão para melhorar a entrega
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'ParkNow Mailer',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk' // Importante para e-mails transacionais
      }
    };

    return nodemailer.createTransport(baseConfig);
  }

  // Enviar o email com otimizações para evitar spam
  async send(template, subject) {
    // 1) Renderizar o template Pug
    const html = pug.renderFile(
      path.join(__dirname, `../views/emails/${template}.pug`),
      {
        firstName: this.firstName,
        url: this.url,
        subject,
      }
    );

    // Gerar versão em texto puro do HTML
    const text = htmlToText(html, {
      wordwrap: 130,
      preserveNewlines: true
    });

    // 2) Definir as opções do email com headers otimizados
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject: subject,
      html: html,
      text: text, // Versão em texto puro
      // Headers adicionais para melhorar a entrega
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'Precedence': 'bulk',
        'List-Unsubscribe': '<mailto:unsubscribe@parknow.com.br>', // Configure um email para unsubscribe
        'List-Help': '<mailto:help@parknow.com.br>',
        'List-Owner': '<mailto:owner@parknow.com.br>',
        'List-Post': 'NO',
        'List-Id': 'ParkNow Notifications <notifications.parknow.com.br>',
        'X-Report-Abuse': 'Report abuse to <mailto:abuse@parknow.com.br>'
      },
      // Configurações de prioridade
      priority: 'high',
      // Configurações de formatação
      encoding: 'utf-8',
      // Configurações de formatação de texto
      textEncoding: 'quoted-printable',
      // Configurações de formatação de anexos
      attachments: [] // Adicione anexos se necessário
    };

    // 3) Criar um transporte e enviar o email
    await this.newTransport().sendMail(mailOptions);
  }

  // Métodos específicos para diferentes tipos de email
  async sendWelcome() {
    await this.send('welcome', 'Bem-vindo ao ParkNow!');
  }

  async sendPasswordReset() {
    await this.send(
      'passwordReset',
      'Seu token para redefinição de senha (válido por 10 minutos)'
    );
  }

  async sendPasswordChanged() {
    await this.send('passwordChanged', 'Sua senha foi alterada com sucesso');
  }
}
