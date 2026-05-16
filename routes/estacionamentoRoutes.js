// routes/estacionamentoRoutes.js
// Define as rotas relacionadas a estacionamentos e vagas (visão do usuário logado).

const express = require('express');
const estacionamentoController = require('../controllers/estacionamentoController');
const { protectUser } = require('../middleware/authMiddleware'); // Protege rotas de usuário
const { param, query, body: _body } = require('express-validator'); // Validação de params, query e body
const { handleValidationErrors } = require('../middleware/validationMiddleware'); // Handler

const router = express.Router();

// --- Middleware de Proteção ---
router.use(protectUser); // Aplica a todas as rotas abaixo

// --- Validações Reutilizáveis ---
const idParamValidation = param('id', 'ID de Estacionamento inválido').isInt({ min: 1 }).toInt();
const vagaIdParamValidation = param('vagaId', 'ID de Vaga inválido').isInt({ min: 1 }).toInt();
const estacionamentoIdQueryValidation = query('estacionamentoId', 'ID de Estacionamento (query) inválido').optional().isInt({ min: 1 }).toInt();

// --- Rotas de Estacionamentos ---

// GET /api/estacionamentos - Lista todos (para mapa)
router.get('/', estacionamentoController.getAllEstacionamentos);

// GET /api/estacionamentos/:id - Detalhes de um estacionamento
router.get('/:id', [
    idParamValidation
], handleValidationErrors, estacionamentoController.getEstacionamentoById);


// --- Rotas de Vagas ---

// GET /api/estacionamentos/:id/vagas - Lista vagas de um estacionamento
router.get('/:id/vagas', [
    idParamValidation
], handleValidationErrors, estacionamentoController.getVagasByEstacionamentoId);

// GET /api/estacionamentos/vagas/livres - Conta vagas livres (filtro opcional)
router.get('/vagas/livres', [ // Endpoint ajustado para mais clareza
    estacionamentoIdQueryValidation // Valida ?estacionamentoId=X opcional
], handleValidationErrors, estacionamentoController.getVagasLivresCount);


// --- Rotas de Ações em Vagas ---

// POST /api/estacionamentos/vagas/:vagaId/agendar - Ocupa/Agenda uma vaga
router.post('/vagas/:vagaId/agendar', [
    vagaIdParamValidation
], handleValidationErrors, estacionamentoController.agendarVaga);

// --- Rotas de Pagamento ---

// GET /api/estacionamentos/:id/pix-details - Obtém os detalhes de pagamento PIX de um estacionamento
router.get('/:id/pix-details', [
    idParamValidation
], handleValidationErrors, estacionamentoController.getPixPaymentDetails);

// GET /api/estacionamentos/vagas/:vagaId/tempo - Obtém tempo estacionado atual
router.get('/vagas/:vagaId/tempo', [
    vagaIdParamValidation
], handleValidationErrors, estacionamentoController.getTempoEstacionado);

// POST /api/estacionamentos/vagas/:vagaId/liberar - Libera uma vaga ocupada pelo usuário
router.post('/vagas/:vagaId/liberar', [
    vagaIdParamValidation
], handleValidationErrors, estacionamentoController.liberarVaga);

module.exports = router;