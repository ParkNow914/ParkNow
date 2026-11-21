// controllers/reservaPagamentoController.js
//
// Fluxo PIX 100% manual (sem gateway pago). Geração do BR Code é local;
// confirmação é feita por admin via painel ou via link tokenado enviado por
// e-mail. Ver docs/FLUXO_PIX_MANUAL.md.

const reservaService = require('../services/reservaService');
const pagamentoModel = require('../models/pagamentoModel');
const reservaModel = require('../models/reservaModel');
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
            const body = req.body || {};
            // Aceita os dois formatos usados pelo frontend (snake_case e camelCase).
            // Qualquer campo de valor/preço enviado pelo cliente é IGNORADO: o
            // preço é calculado no servidor pela tabela do estacionamento.
            const metodoPagamento = body.metodo_pagamento || body.metodoPagamento || 'pix';
            const estacionamentoId = parseInt(body.estacionamento_id ?? body.estacionamentoId, 10);
            const vagaIdRaw = body.vaga_id ?? body.vagaId;
            const vagaId = vagaIdRaw === undefined || vagaIdRaw === null || vagaIdRaw === ''
                ? null
                : parseInt(vagaIdRaw, 10);
            const placa = body.veiculo_placa || body.placaVeiculo || body.placa || null;

            if (metodoPagamento !== 'pix') {
                throw new AppError('Apenas pagamento PIX está disponível no momento.', 400);
            }
            if (!Number.isInteger(estacionamentoId) || estacionamentoId <= 0) {
                throw new AppError('Informe o estacionamento.', 400);
            }
            if (vagaId !== null && (!Number.isInteger(vagaId) || vagaId <= 0)) {
                throw new AppError('Vaga inválida.', 400);
            }

            // Sem datas = reserva imediata. Sem saída = duração informada ou 1 hora.
            const entrada = body.data_entrada ? new Date(body.data_entrada) : new Date();
            let saida;
            if (body.data_saida) {
                saida = new Date(body.data_saida);
            } else {
                const duracaoMin = parseInt(body.duracao_minutos ?? body.duracaoMinutos ?? 60, 10);
                if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) {
                    throw new AppError('Duração inválida.', 400);
                }
                saida = new Date(entrada.getTime() + duracaoMin * 60 * 1000);
            }

            const { reserva, vaga, estacionamento, preco, pix: resultado } =
                await reservaService.criarReservaComPix({
                    usuarioId: userId,
                    estacionamentoId,
                    vagaId,
                    entrada,
                    saida,
                    placa,
                    paymentProcessingService,
                });

            return res.status(201).json({
                success: true,
                reserva: {
                    id: reserva.id,
                    estacionamento: {
                        id: estacionamento.id,
                        nome: estacionamento.nome,
                    },
                    vaga: { id: vaga.id, numero: vaga.numero },
                    data_entrada: entrada.toISOString(),
                    data_saida: saida.toISOString(),
                    valor_total: preco.valor,
                    horas_cobradas: preco.horasCobradas,
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
