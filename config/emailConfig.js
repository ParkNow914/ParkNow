// Configurações avançadas para entrega de e-mail
module.exports = {
  // Configurações do servidor SMTP
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true para 465, false para outras portas
  requireTLS: true,
  tls: {
    rejectUnauthorized: false
  },
  
  // Autenticação
  auth: {
    user: process.env.EMAIL_USER || 'parknow914@gmail.com',
    pass: process.env.EMAIL_PASS || 'kwou ckrj nhfm rmqv' // App Password gerado em 16/06/2025
  },
  
  // Configurações de pool para melhor desempenho
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 5,
  
  // Headers para melhorar a entrega
  headers: {
    'X-Priority': '1',
    'X-MSMail-Priority': 'High',
    'Importance': 'high',
    'Precedence': 'bulk',
    'Auto-Submitted': 'auto-generated',
    'X-Auto-Response-Suppress': 'OOF, AutoReply',
    'X-Mailer': 'ParkNow Mailer',
    'List-Unsubscribe': '<mailto:unsubscribe@parknow.com.br>',
    'List-Help': '<mailto:help@parknow.com.br>',
    'List-Owner': '<mailto:suporte@parknow.com.br>',
    'List-Post': 'NO',
    'List-Id': 'ParkNow Notifications <notifications.parknow.com.br>',
    'X-Report-Abuse': 'Report abuse to <mailto:abuse@parknow.com.br>'
  },
  
  // Configurações de formatação
  textEncoding: 'quoted-printable',
  priority: 'high',
  encoding: 'utf-8',
  
  // Configurações de expiração
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  
  // Configurações de DKIM (opcional, mas recomendado)
  dkim: {
    domainName: 'parknow.com.br',
    keySelector: 'default',
    privateKey: process.env.DKIM_PRIVATE_KEY || ''
  },
  
  // Configurações de SPF, DKIM e DMARC (importante para evitar spam)
  spf: 'v=spf1 include:_spf.google.com ~all',
  dkimSelector: 'default',
  dmarc: 'v=DMARC1; p=none; rua=mailto:dmarc@parknow.com.br'
};
