// controllers/reservaPagamentoController.js
//
// Fluxo PIX 100% manual (sem gateway pago). Geração do BR Code é local;
// confirmação é feita por admin via painel ou via link tokenado enviado por
// e-mail. Ver docs/FLUXO_PIX_MANUAL.md.

const reservaService = require('../services/reservaService');
const pagamentoModel = require('../models/pagamentoModel');
const reservaModel = require('../models/reservaModel');
const estacionamentoModel = require('../models/estacionamentoModel');
const paymentProcessingService = require('../services/estacionamentoPaymentProcessingService');
const { AppError, NotFoundError, AuthorizationError } = require('../utils/AppError');
const logger = require('../utils/logger');

class ReservaPagamentoController {
    /**
     * Cria uma reserva e gera o PIX (BR Code) para pagamento manual.
     * O usuário paga direto na chave do estacionamento — sem custo de gateway.
     */
    async criarReservaComPagamento(req, res, next) {
        try {
            const userId = req.user.id;
            const {
                metodo_pagamento = 'pix',
                estacionamento_id,
                vaga_id,
                data_entrada,
                data_saida,
                valor,
                veiculo_placa,
                veiculo_modelo,
            } = req.body;

            if (metodo_pagamento !== 'pix') {
                throw new AppError('Apenas pagamento PIX está disponível no momento.', 400);
            }
            if (!estacionamento_id || !data_entrada || !data_saida || !valor) {
                throw new AppError('Campos obrigatórios não informados.', 400);
            }

            const estacionamento = await estacionamentoModel.findById(estacionamento_id);
            if (!estacionamento) throw new NotFoundError('Estacionamento não encontrado.');
            if (!estacionamento.chave_pix) {
                throw new AppError(
                    'Este estacionamento ainda não configurou uma chave PIX para receber pagamentos.',
                    400
                );
            }

            // 1) Cria a reserva (status pendente)
            const reserva = await reservaService.criarReserva({
                estacionamento_id,
                usuario_id: userId,
                vaga_id: vaga_id || null,
                data_entrada_prevista: data_entrada,
                data_saida_prevista: data_saida,
                valor_total: valor,
                placa_veiculo: veiculo_placa,
                modelo_veiculo: veiculo_modelo,
                status: 'pendente_pagamento',
                status_pagamento: 'pendente',
            });

            logger.info('[Pagamento] Reserva criada, gerando PIX manual', {
                reserva_id: reserva.id,
                valor,
            });

            // 2) Gera PIX local + grava pagamento via service compartilhado
            const resultado = await paymentProcessingService.processarPagamento(
                reserva.id,
                'pix',
                {}
            );

            return res.status(201).json({
                success: true,
                reserva: {
                    id: reserva.id,
                    estacionamento: {
                        id: estacionamento.id,
                        nome: estacionamento.nome,
                        endereco: estacionamento.endereco,
                    },
                    data_entrada,
                    data_saida,
                    valor_total: valor,
                    status: 'pendente_pagamento',
                    status_pagamento: 'pendente',
                },
                pagamento: {
                    id: resultado.pagamento_id,
                    status: resultado.status,
                    metodo: 'pix',
                },
                pix: {
                    qr_code: resultado.qr_code,
                    qr_code_text: resultado.qr_code_text,
                    qr_code_base64: resultado.qr_code_base64,
                    chave_pix: resultado.chave_pix,
                    nome_titular: resultado.nome_titular,
                    valor: resultado.valor,
                    expira_em: resultado.expira_em,
                },
                message:
                    'Reserva criada. Pague o PIX pela chave informada e anexe o comprovante para confirmação.',
            });
        } catch (error) {
            logger.error('Erro ao criar reserva com pagamento PIX manual:', {
                error: error.message,
                userId: req.user?.id,
            });
            next(error);
        }
    }

    /**
     * Consulta o status atual de um pagamento. Sem polling externo —
     * apenas reflete o que está no banco (atualizado quando admin confirma).
     */
    async consultarStatusPagamento(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user.id;
            const pagamento = await pagamentoModel.buscarPagamentoPorId(id);
            if (!pagamento) throw new NotFoundError('Pagamento não encontrado.');
            if (pagamento.id_usuario !== userId) {
                throw new AuthorizationError('Não autorizado a consultar este pagamento.');
            }
            const reserva = await reservaModel.findReservaById(pagamento.reserva_id);
            return res.status(200).json({
                success: true,
                data: {
                    id: pagamento.id,
                    status: pagamento.status,
                    valor: pagamento.valor,
                    metodo: pagamento.metodo_pagamento || pagamento.metodo,
                    reserva_id: pagamento.reserva_id,
                    reserva_status: reserva ? reserva.status : null,
                    created_at: pagamento.created_at,
                    updated_at: pagamento.updated_at,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Retorna o PIX (copia-e-cola + QR base64) salvo de uma reserva, para
     * reexibir o pagamento sem regerar.
     */
    async obterPixPorReserva(req, res, next) {
        try {
            const reservaId = parseInt(req.params.id, 10);
            const userId = req.user.id;
            if (Number.isNaN(reservaId)) throw new AppError('ID da reserva inválido.', 400);

            const reserva = await reservaModel.findReservaById(reservaId);
            if (!reserva) throw new NotFoundError('Reserva não encontrada.');
            if (reserva.usuario_id !== userId) {
                throw new AuthorizationError('Você não tem permissão para acessar esta reserva.');
            }

            const pagamento = await pagamentoModel.buscarUltimoPagamentoPorReserva(reservaId);
            if (!pagamento) throw new NotFoundError('Nenhum pagamento associado a esta reserva.');

            const metodoPagamento = pagamento.metodo_pagamento || pagamento.metodo;
            if (metodoPagamento !== 'pix') {
                throw new AppError('Esta reserva não possui pagamento PIX.', 400);
            }

            let dadosPix = pagamento.dados_retorno || {};
            if (typeof dadosPix === 'string') {
                try { dadosPix = JSON.parse(dadosPix); } catch (_e) { dadosPix = {}; }
            }

            const qrCodeBase64 = dadosPix.qr_code_base64 || dadosPix.pix_qr_code_base64;
            const qrCodeText = dadosPix.qr_code_text || dadosPix.qr_code;

            if (!qrCodeBase64 && !qrCodeText) {
                throw new AppError('Dados do QR Code PIX indisponíveis. Gere um novo pagamento.', 409);
            }

            return res.status(200).json({
                success: true,
                data: {
                    reserva_id: reservaId,
                    pagamento_id: pagamento.id,
                    status: pagamento.status,
                    valor: pagamento.valor,
                    qr_code: qrCodeText,
                    qr_code_text: qrCodeText,
                    qr_code_base64: qrCodeBase64,
                    chave_pix: dadosPix.chave_pix || null,
                    nome_titular: dadosPix.nome_titular || null,
                    expira_em: dadosPix.expira_em || pagamento.expira_em,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Regera o PIX para uma reserva ainda pendente (em caso do anterior ter
     * expirado). Reaproveita o service para garantir consistência.
     */
    async gerarNovoQRCode(req, res, next) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            const pagamentoAntigo = await pagamentoModel.buscarPagamentoPorId(id);
            if (!pagamentoAntigo) throw new NotFoundError('Pagamento não encontrado.');
            if (pagamentoAntigo.id_usuario !== userId) {
                throw new AuthorizationError('Não autorizado.');
            }
            if (pagamentoAntigo.status === 'aprovado') {
                throw new AppError('Este pagamento já foi confirmado.', 400);
            }

            const novoResultado = await paymentProcessingService.processarPagamento(
                pagamentoAntigo.reserva_id,
                'pix',
                {}
            );

            return res.status(200).json({
                success: true,
                data: {
                    pagamento_id: novoResultado.pagamento_id,
                    qr_code: novoResultado.qr_code,
                    qr_code_text: novoResultado.qr_code_text,
                    qr_code_base64: novoResultado.qr_code_base64,
                    valor: novoResultado.valor,
                    expira_em: novoResultado.expira_em,
                },
                message: 'Novo QR Code PIX gerado com sucesso.',
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ReservaPagamentoController();
