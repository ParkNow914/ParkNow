// routes/index.js
// Arquivo principal do roteador da API. Agrega e monta todas as rotas.

const express = require('express');
const router = express.Router(); // Cria instância do roteador

// Importa os módulos de rota específicos
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const estacionamentoRoutes = require('./estacionamentoRoutes');
const reservaRoutes = require('./reservaRoutes'); // Rotas de reserva
const adminApiRoutes = require('./adminApiRoutes'); // Rotas da API admin
const contactRoutes = require('./contactRoutes'); // Rotas de contato e newsletter
const statusRoutes = require('./statusRoutes'); // Rotas de status do servidor
const notificationRoutes = require('./notificationRoutes'); // Rotas de notificações
const utilsRoutes = require('./utilsRoutes'); // Rotas de utilitários (CEP, etc)
const timezoneRoutes = require('./timezoneRoutes'); // Rotas de timezone
const paymentRoutes = require('./paymentRoutes'); // Rotas de pagamento
const estacionamentoPaymentRoutes = require('./estacionamentoPaymentRoutes'); // Rotas de pagamento de estacionamento
const estacionamentoPaymentConfigRoutes = require('./estacionamentoPaymentConfigRoutes'); // Rotas de configuração de pagamento
const reservaPagamentoRoutes = require('./reservaPagamentoRoutes'); // Rotas de reserva com pagamento
const pagamentoRoutes = require('./pagamentoRoutes'); // Rotas de pagamento PIX
// Rotas de confirmação manual de PIX removidas - usar apenas ASAAS
const cnpjRoutes = require('./cnpjRoutes'); // Rotas de validação de CNPJ
const emailValidationRoutes = require('./emailValidationRoutes'); // Rotas de validação de e-mail
const horarioFuncionamentoRoutes = require('./horarioFuncionamentoRoutes'); // Rotas de horários de funcionamento

// Importa as rotas da API v2
const apiV2Routes = require('./v2'); // Rotas da API v2

// --- Montagem das Rotas com Prefixos ---

// Rotas de Autenticação (login, register, refresh, reset, logout)
router.use('/auth', authRoutes);

// Rotas do Usuário (perfil) - Protegidas internamente com protectUser
router.use('/user', userRoutes);

// Rotas de Estacionamentos e Vagas (visão do usuário) - Protegidas internamente com protectUser
router.use('/estacionamentos', estacionamentoRoutes);

// Rotas de Reservas - Protegidas internamente com protectUser
router.use('/reservas', reservaRoutes);

// Rotas da API de Administração - Protegidas internamente com protectAdmin
router.use('/admin', adminApiRoutes);

// Rotas de contato e newsletter (públicas)
router.use('/contact', contactRoutes);

// Rotas de status do servidor
router.use('/status', statusRoutes);

// Rotas de notificações em tempo real
router.use('/notifications', notificationRoutes);

// Rotas da API v2
router.use('/v2', apiV2Routes);

// Rotas de utilitários (CEP, etc)
router.use('/utils', utilsRoutes);

// Rotas de timezone (sincronização e consulta)
router.use('/timezone', timezoneRoutes);

// Rotas de pagamento (públicas e protegidas)
router.use('/payments', paymentRoutes);

// Rotas de pagamento de estacionamento (protegidas para donos de estacionamento)
router.use('/estacionamento-payments', estacionamentoPaymentRoutes);

// Rotas de configuração de pagamento
router.use('/estacionamento-payment-config', estacionamentoPaymentConfigRoutes);

// Rotas de reserva com pagamento
router.use('/reservas', reservaPagamentoRoutes);  // Para /api/reservas/com-pagamento
router.use('/', reservaPagamentoRoutes);           // Para /api/pagamentos/:id/status e /api/webhooks/asaas

// Rotas de confirmação manual de PIX removidas - usar apenas ASAAS

// Rotas de validação de CNPJ
router.use('/cnpj', cnpjRoutes);

// Rota de validação de e-mail
router.use('/validate-email', emailValidationRoutes);

// Rotas de horários de funcionamento
router.use('/api/horarios', horarioFuncionamentoRoutes);

// Rotas de pagamento PIX
router.use('/pix', pagamentoRoutes);

// Rotas de pagamento PIX
const pixPaymentRoutes = require('./pixPaymentRoutes');

// Mount PIX payment routes
router.use('/api', pixPaymentRoutes);

// Rotas de webhook para notificações de pagamento
const webhookRouter = require('./webhookRoutesNew');

// Mount webhook routes
router.use('/webhook', webhookRouter);

// Rotas de tarefas agendadas (cron jobs)
const cronRoutes = require('./cronRoutes');

// Mount cron routes
router.use('/cron', cronRoutes);

// Exporta o roteador principal configurado
module.exports = router;
