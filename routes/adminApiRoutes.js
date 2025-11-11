// routes/adminApiRoutes.js
// Define as rotas da API para o painel de administração, protegidas e com validação.

const express = require('express');
const adminApiController = require('../controllers/adminApiController');
const adminSplitsController = require('../controllers/adminSplitsController');
const { protectAdmin } = require('../middleware/adminAuthMiddleware'); // Middleware de autenticação admin
const { param, body, query } = require('express-validator'); // Funções de validação
const { handleValidationErrors } = require('../middleware/validationMiddleware'); // Handler de erros de validação
const upload = require('../middleware/uploadMiddleware'); // Para upload de foto de estacionamento

const router = express.Router();

// --- Middleware de Proteção ---
// Aplica 'protectAdmin' a TODAS as rotas definidas abaixo neste arquivo.
router.use(protectAdmin);

// --- Validações Reutilizáveis ---
const idParamValidation = (paramName = 'id', message = 'ID inválido na URL') => param(paramName, message).isInt({ min: 1 }).toInt();
const estacionamentoIdParamValidation = param('estacionamentoId', 'ID de Estacionamento inválido na URL').isInt({ min: 1 }).toInt();
const vagaIdParamValidation = param('vagaId', 'ID de Vaga inválido na URL').isInt({ min: 1 }).toInt();
const vagaNumParamValidation = param('numero', 'Número de Vaga inválido na URL').isInt({ min: 1 }).toInt();
const userIdParamValidation = param('userId', 'ID de Usuário inválido na URL').isInt({ min: 1 }).toInt();

// --- Rotas de Gerenciamento de Vagas ---
// GET /api/admin/vagas - Lista todas as vagas (admin view)
router.get('/vagas', adminApiController.getAllVagas); // Adicionar filtros e paginação via query() se necessário

// GET /api/admin/vagas/ocupadas - Lista vagas ocupadas
router.get('/vagas/ocupadas', adminApiController.getVagasOcupadas); // Adicionar filtros

// GET /api/admin/vagas/:id/tempo-db - Obtém tempo salvo no DB
router.get('/vagas/:id/tempo-db', [
    idParamValidation('id', 'ID da vaga inválido')
], handleValidationErrors, adminApiController.getTempoEstacionadoDb);

// POST /api/admin/vagas/:numero/entrada - Registra entrada manual
router.post('/vagas/:numero/entrada', [
    vagaNumParamValidation,
    body('placa', 'Placa é obrigatória e formato inválido').trim().matches(/^([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/i).toUpperCase(),
    body('tipoVeiculo', 'Tipo de veículo é obrigatório').trim().notEmpty().isLength({ max: 20 }).escape(),
    body('estacionamentoId', 'ID do Estacionamento é obrigatório').isInt({ min: 1 }).toInt()
], handleValidationErrors, adminApiController.registrarEntrada);

// POST /api/admin/vagas/:id/saida - Registra saída manual
router.post('/vagas/:id/saida', [
    idParamValidation('id', 'ID da vaga inválido')
], handleValidationErrors, adminApiController.registrarSaida);

// POST /api/admin/vagas/atualizar-tempo - Endpoint para cron job ou trigger manual (sem validação de entrada)
router.post('/vagas/atualizar-tempo', adminApiController.atualizarTempoEstacionadoGlobal);

// --- Rotas de Configuração/Gerenciamento Estacionamento ---
// PUT /api/admin/config/vagas - Ajusta número total de vagas de um estacionamento
router.put('/config/vagas', [
    body('numeroDeVagas', 'Número de vagas inválido (deve ser >= 0)').isInt({ min: 0 }).toInt(),
    body('estacionamentoId', 'ID do Estacionamento é obrigatório').isInt({ min: 1 }).toInt()
], handleValidationErrors, adminApiController.atualizarNumeroDeVagas);

// GET /api/admin/estacionamentos - Lista todos estacionamentos (visão admin)
router.get('/estacionamentos', adminApiController.getAllEstacionamentosAdmin);

// POST /api/admin/estacionamentos - Cria novo estacionamento
router.post('/estacionamentos', [
    // Validação dos campos necessários para criar um estacionamento
    body('nome', 'Nome do estacionamento obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    body('endereco', 'Endereço obrigatório').trim().notEmpty().isLength({ max: 255 }).escape(),
    body('vagas', 'Número de vagas inválido (>= 0)').isInt({ min: 0 }).toInt(),
    body('precoHora', 'Preço por hora inválido (>= 0)').isFloat({ min: 0 }).toFloat(),
    body('precoDia', 'Preço por dia inválido (>= 0)').isFloat({ min: 0 }).toFloat(),
    // Admin ID é pego do usuário logado no controller, não precisa validar aqui
    // body('admin_id', 'ID do Admin responsável obrigatório').isInt({ min: 1 }).toInt(), // Removido - pego do req.admin
    body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('Latitude inválida (-90 a 90)').toFloat(),
    body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude inválida (-180 a 180)').toFloat(),
    body('descricao').optional({checkFalsy: true}).trim().isLength({ max: 1000 }).escape() // Aumentado limite descrição
    // Upload de foto 'foto' seria tratado por outra rota ou no controller se usar /api/auth/admin/register
], handleValidationErrors, adminApiController.createEstacionamentoAdmin);

// GET /api/admin/estacionamentos/:estacionamentoId - Detalhes de um estacionamento (visão admin)
router.get('/estacionamentos/:estacionamentoId', [
    estacionamentoIdParamValidation
], handleValidationErrors, adminApiController.getEstacionamentoByIdAdmin);

// GET /api/admin/estacionamentos/:estacionamentoId/vagas - Lista vagas de um estacionamento específico
router.get('/estacionamentos/:estacionamentoId/vagas', [
    estacionamentoIdParamValidation
], handleValidationErrors, adminApiController.getVagasByEstacionamentoId);

// PUT /api/admin/estacionamentos/:estacionamentoId - Atualiza um estacionamento
router.put('/estacionamentos/:estacionamentoId', [
    estacionamentoIdParamValidation,
    // Validações opcionais para os campos permitidos na atualização
    body('nome').optional().trim().notEmpty().withMessage('Nome não pode ser vazio').isLength({ max: 255 }).escape(),
    body('endereco').optional().trim().notEmpty().withMessage('Endereço não pode ser vazio').isLength({ max: 255 }).escape(),
    body('vagas').optional().isInt({ min: 0 }).withMessage('Número de vagas inválido').toInt(),
    body('precoHora').optional().isFloat({ min: 0 }).withMessage('Preço/Hora inválido').toFloat(),
    body('precoDia').optional().isFloat({ min: 0 }).withMessage('Preço/Dia inválido').toFloat(),
    // Validações opcionais para chave PIX
    body('chave_pix').optional().trim().notEmpty().withMessage('Chave PIX não pode ser vazia').isLength({ min: 11, max: 255 }),
    body('tipo_chave_pix').optional().trim().notEmpty().withMessage('Tipo de chave PIX é obrigatório').isIn(['cpf', 'cnpj', 'email', 'telefone', 'chave_aleatoria']),
    body('nome_titular_pix').optional().trim().notEmpty().withMessage('Nome do titular da chave PIX é obrigatório').isLength({ max: 100 }),
    body('latitude').optional({ nullable: true, checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('Latitude inválida').toFloat(),
    body('longitude').optional({ nullable: true, checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude inválida').toFloat(),
    body('descricao').optional({ nullable: true }).trim().isLength({ max: 1000 }).escape(),
    body('admin_id').optional().isInt({ min: 1 }).withMessage('ID do Admin inválido').toInt()
], handleValidationErrors, adminApiController.updateEstacionamento);

// DELETE /api/admin/estacionamentos/:estacionamentoId - Exclui um estacionamento
router.delete('/estacionamentos/:estacionamentoId', [
    estacionamentoIdParamValidation
], handleValidationErrors, adminApiController.deleteEstacionamento);

// --- Rotas de Gerenciamento Usuários ---
// GET /api/admin/users - Lista todos os usuários
router.get('/users', adminApiController.getAllUsersAdmin); // Adicionar filtros e paginação aqui

// PATCH /api/admin/users/:userId/status - Ativa/Desativa um usuário
router.patch('/users/:userId/status', [
    userIdParamValidation,
    body('status', "Status deve ser 'ativo' ou 'inativo'").isIn(['ativo', 'inativo'])
], handleValidationErrors, adminApiController.setUserStatus);

// --- Rotas de Splits e Relatórios ---
// GET /api/admin/splits/estatisticas - Estatísticas gerais de splits
router.get('/splits/estatisticas', adminSplitsController.obterEstatisticas);

// GET /api/admin/splits/transacoes - Lista transações com splits
router.get('/splits/transacoes', adminSplitsController.listarTransacoes);

// GET /api/admin/splits/transacoes/:id - Detalhes de uma transação
router.get('/splits/transacoes/:id', [
    idParamValidation('id', 'ID da transação inválido')
], handleValidationErrors, adminSplitsController.obterDetalheTransacao);

// GET /api/admin/splits/exportar - Exportar relatório CSV
router.get('/splits/exportar', adminSplitsController.exportarRelatorio);

// --- Rotas de Conexão ASAAS ---
// Rotas para gerenciar a conexão de estacionamentos com ASAAS
const estacionamentoAsaasRoutes = require('./estacionamentoAsaasRoutes');
router.use('/estacionamentos', estacionamentoAsaasRoutes);

// Exporta o roteador configurado
module.exports = router;