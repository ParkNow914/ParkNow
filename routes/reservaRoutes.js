// routes/reservaRoutes.js
// Define as rotas para criação e gerenciamento de reservas pelo usuário.

const express = require('express');
const reservaController = require('../controllers/reservaController');
const { protectUser } = require('../middleware/authMiddleware'); // Protege rotas
const { body, param } = require('express-validator'); // Validação
const { handleValidationErrors } = require('../middleware/validationMiddleware'); // Handler

const router = express.Router();

// Aplica proteção de usuário a todas as rotas abaixo
router.use(protectUser);

// --- Rotas de Reserva ---

// POST /api/reservas - Criar nova reserva
router.post('/', [
    body('vaga_id', 'ID da vaga é obrigatório').isInt({ min: 1 }).toInt(),
    body('estacionamento_id', 'ID do estacionamento obrigatório').isInt({ min: 1 }).toInt(),
    // Valida se é uma data ISO8601 válida e converte para objeto Date
    body('horario_inicio_reserva', 'Horário de início inválido (AAAA-MM-DDTHH:MM)').isISO8601().toDate(),
    body('duracao_minutos', 'Duração inválida (mínimo 15 minutos)').isInt({ min: 15 }).toInt()
], handleValidationErrors, reservaController.criarReserva);

// GET /api/reservas/minhas - Listar minhas reservas
router.get('/minhas', reservaController.listarMinhasReservas);

// DELETE /api/reservas/:reservaId/cancelar - Cancelar uma reserva minha
router.delete('/:reservaId/cancelar', [
    param('reservaId', 'ID da reserva inválido').isInt({ min: 1 }).toInt()
], handleValidationErrors, reservaController.cancelarMinhaReserva);

// GET /api/reservas/:reservaId - Obter detalhes de uma reserva específica
router.get('/:reservaId', [
    param('reservaId', 'ID da reserva inválido').isInt({ min: 1 }).toInt()
], handleValidationErrors, reservaController.obterReservaPorId);

// PUT /api/reservas/:reservaId/estender - Estender a duração de uma reserva
router.put('/:reservaId/estender', [
    param('reservaId', 'ID da reserva inválido').isInt({ min: 1 }).toInt(),
    body('duracao_adicional_minutos', 'Duração adicional inválida (mínimo 15 minutos)').isInt({ min: 15, max: 720 }).toInt()
], handleValidationErrors, reservaController.estenderReserva);

// DELETE /api/reservas/historico/limpar - Limpar histórico de reservas
router.delete('/historico/limpar', reservaController.limparHistorico);

// POST /api/reservas/:reservaId/notificar-pagamento - Notificar visualização do QR Code PIX
router.post('/:reservaId/notificar-pagamento', [
    param('reservaId', 'ID da reserva inválido').isInt({ min: 1 }).toInt()
], handleValidationErrors, reservaController.notificarVisualizacaoPagamento);

module.exports = router;
