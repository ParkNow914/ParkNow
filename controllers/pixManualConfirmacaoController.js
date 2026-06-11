// controllers/pixManualConfirmacaoController.js
//
// Always-free PIX manual: usuário envia comprovante após pagar; admin confirma
// ou rejeita pelo painel. Sem gateway externo, sem custo por transação.

const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');
const pool = require('../models/db');
const {
    AppError,
    NotFoundError,
    BadRequestError,
    AuthorizationError,
} = require('../utils/AppError');
const reservaModel = require('../models/reservaModel');
const pagamentoModel = require('../models/pagamentoModel');
const socketService = require('../services/socketService');
const { sanitizeComprovanteUpload } = require('../utils/uploadSecurity');

/**
 * USUÁRIO — envia o comprovante PIX (foto / PDF) de uma reserva já com pagamento criado.
 * Multer salva o arquivo em /uploads; aqui apenas registramos o path no pagamento.
 *
 * POST /api/reservas/:id/comprovante
 * Body: multipart/form-data com campo `comprovante`
 */
async function enviarComprovante(req, res, next) {
    try {
        const reservaId = parseInt(req.params.id, 10);
        const userId = req.user.id;
        if (Number.isNaN(reservaId)) throw new BadRequestError('ID da reserva inválido.');
        if (!req.file) throw new BadRequestError('Anexe um comprovante (imagem ou PDF).');

        const reserva = await reservaModel.findReservaById(reservaId);
        if (!reserva) {
            // Limpa o arquivo já salvo para não deixar lixo
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
            throw new NotFoundError('Reserva não encontrada.');
        }
        if (reserva.usuario_id !== userId) {
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
            throw new AuthorizationError('Você não tem permissão sobre esta reserva.');
        }

        const pagamento = await pagamentoModel.buscarUltimoPagamentoPorReserva(reservaId);
        if (!pagamento) {
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
            throw new NotFoundError('Nenhum pagamento associado a esta reserva.');
        }
        if (pagamento.status === 'aprovado' || pagamento.status === 'pago') {
            try { fs.unlinkSync(req.file.path); } catch (_e) {}
            throw new AppError('Este pagamento já foi confirmado.', 409);
        }

        // Valida o conteúdo REAL do arquivo (magic bytes) e, se for imagem,
        // re-encoda removendo EXIF/GPS. Lança BadRequestError em conteúdo inválido.
        const { path: sanitizedPath, sha256 } = await sanitizeComprovanteUpload(req.file);

        // Anti-duplicação: o mesmo arquivo de comprovante não pode ser
        // reutilizado no pagamento de OUTRA reserva (indício de fraude).
        const { rows: dupRows } = await pool.query(
            `SELECT p.id, p.reserva_id
               FROM pagamentos p
              WHERE p.comprovante_hash = $1
                AND p.reserva_id <> $2
              LIMIT 1`,
            [sha256, reservaId]
        );
        if (dupRows.length > 0) {
            try { fs.unlinkSync(sanitizedPath); } catch (_e) {}
            logger.warn('[PIX manual] Comprovante duplicado rejeitado', {
                reservaId,
                hashConflitoCom: dupRows[0].reserva_id,
            });
            throw new AppError(
                'Este comprovante já foi usado em outra reserva. Envie o comprovante correto desta transação.',
                409
            );
        }

        const comprovantePath = `/uploads/${path.basename(sanitizedPath)}`;
        await pool.query(
            `UPDATE pagamentos
                SET comprovante_url        = $1,
                    comprovante_hash       = $2,
                    comprovante_enviado_em = NOW(),
                    rejeitado_em           = NULL,
                    motivo_rejeicao        = NULL,
                    updated_at             = NOW()
              WHERE id = $3`,
            [comprovantePath, sha256, pagamento.id]
        );

        logger.info('[PIX manual] Comprovante anexado pelo usuário', {
            reservaId,
            pagamento_id: pagamento.id,
            comprovante: comprovantePath,
        });

        // Notifica admins do estacionamento via Socket.IO (fila a confirmar)
        try {
            socketService.emitToAdmin('comprovante_pix_recebido', {
                reserva_id: reservaId,
                pagamento_id: pagamento.id,
                valor: pagamento.valor,
                enviado_em: new Date().toISOString(),
            });
        } catch (e) {
            logger.warn('[PIX manual] Falha ao emitir socket (continuando):', e.message);
        }

        return res.status(200).json({
            success: true,
            message: 'Comprovante enviado. Aguardando confirmação do administrador.',
            data: { pagamento_id: pagamento.id, comprovante_url: comprovantePath },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * ADMIN — confirma manualmente o pagamento de uma reserva.
 * Marca pagamento como 'aprovado', reserva como 'confirmada', ocupa a vaga
 * e notifica o usuário via Socket.IO.
 *
 * POST /api/admin/reservas/:id/confirmar-pagamento
 */
async function confirmarPagamento(req, res, next) {
    const reservaId = parseInt(req.params.id, 10);
    const adminId = req.admin?.id;
    const client = await pool.connect();
    try {
        if (Number.isNaN(reservaId)) throw new BadRequestError('ID da reserva inválido.');
        await client.query('BEGIN');

        const { rows: reservaRows } = await client.query(
            `SELECT r.*, e.admin_id
               FROM reservas r
               JOIN estacionamentos e ON e.id = r.estacionamento_id
              WHERE r.id = $1
              FOR UPDATE`,
            [reservaId]
        );
        if (reservaRows.length === 0) throw new NotFoundError('Reserva não encontrada.');
        const reserva = reservaRows[0];

        // RBAC: admin só confirma pagamentos do próprio estacionamento.
        if (parseInt(reserva.admin_id, 10) !== parseInt(adminId, 10)) {
            throw new AuthorizationError(
                'Você não tem permissão sobre este estacionamento.'
            );
        }

        const { rows: pagRows } = await client.query(
            `SELECT id, status FROM pagamentos
              WHERE reserva_id = $1
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE`,
            [reservaId]
        );
        if (pagRows.length === 0) throw new NotFoundError('Pagamento não encontrado.');
        const pagamento = pagRows[0];
        if (pagamento.status === 'aprovado' || pagamento.status === 'pago') {
            throw new AppError('Este pagamento já foi confirmado.', 409);
        }

        await client.query(
            `UPDATE pagamentos
                SET status                  = 'aprovado',
                    confirmado_em           = NOW(),
                    confirmado_por_admin_id = $1,
                    rejeitado_em            = NULL,
                    motivo_rejeicao         = NULL,
                    updated_at              = NOW()
              WHERE id = $2`,
            [adminId, pagamento.id]
        );

        await client.query(
            `UPDATE reservas
                SET status            = 'confirmada',
                    status_pagamento  = 'pago',
                    updated_at        = NOW()
              WHERE id = $1`,
            [reservaId]
        );

        if (reserva.vaga_id) {
            await client.query(
                `UPDATE vagas
                    SET status            = 'ocupada',
                        reserva_id_ativa  = $1
                  WHERE id = $2`,
                [reservaId, reserva.vaga_id]
            );
        }

        await client.query('COMMIT');

        // Notifica o usuário (sala pessoal) e a sala do estacionamento.
        try {
            socketService.notificarUsuario(reserva.usuario_id, 'pagamento_confirmado', {
                reserva_id: reservaId,
                pagamento_id: pagamento.id,
            });
            if (reserva.vaga_id) {
                socketService.emitAtualizacaoVaga(reserva.estacionamento_id, {
                    id: reserva.vaga_id,
                    status: 'ocupada',
                    estacionamento_id: reserva.estacionamento_id,
                });
            }
        } catch (e) {
            logger.warn('[PIX manual] Falha emitir socket pós-confirmação:', e.message);
        }

        logger.info('[PIX manual] Pagamento confirmado pelo admin', {
            reservaId,
            pagamento_id: pagamento.id,
            adminId,
        });

        res.json({
            success: true,
            message: 'Pagamento confirmado com sucesso. Reserva ativa.',
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_e) {}
        next(error);
    } finally {
        client.release();
    }
}

/**
 * ADMIN — rejeita um pagamento (comprovante inválido, valor errado, etc.).
 * Mantém reserva pendente; usuário pode reenviar comprovante.
 *
 * POST /api/admin/reservas/:id/rejeitar-pagamento
 * Body: { motivo: string }
 */
async function rejeitarPagamento(req, res, next) {
    try {
        const reservaId = parseInt(req.params.id, 10);
        const adminId = req.admin?.id;
        const motivo = (req.body?.motivo || '').toString().trim().slice(0, 500);
        if (Number.isNaN(reservaId)) throw new BadRequestError('ID da reserva inválido.');
        if (!motivo) throw new BadRequestError('Informe o motivo da rejeição.');

        // RBAC: confirma ownership
        const { rows: reservaRows } = await pool.query(
            `SELECT r.id, r.usuario_id, e.admin_id
               FROM reservas r
               JOIN estacionamentos e ON e.id = r.estacionamento_id
              WHERE r.id = $1`,
            [reservaId]
        );
        if (reservaRows.length === 0) throw new NotFoundError('Reserva não encontrada.');
        const reserva = reservaRows[0];
        if (parseInt(reserva.admin_id, 10) !== parseInt(adminId, 10)) {
            throw new AuthorizationError('Sem permissão sobre este estacionamento.');
        }

        const { rowCount } = await pool.query(
            `UPDATE pagamentos
                SET rejeitado_em    = NOW(),
                    motivo_rejeicao = $1,
                    updated_at      = NOW()
              WHERE reserva_id = $2
                AND status IN ('pendente')`,
            [motivo, reservaId]
        );

        if (rowCount === 0) {
            throw new AppError(
                'Nenhum pagamento pendente para rejeitar (já confirmado ou cancelado).',
                409
            );
        }

        try {
            socketService.notificarUsuario(reserva.usuario_id, 'pagamento_rejeitado', {
                reserva_id: reservaId,
                motivo,
            });
        } catch (e) {
            logger.warn('[PIX manual] Falha emitir socket pós-rejeição:', e.message);
        }

        logger.info('[PIX manual] Pagamento rejeitado pelo admin', {
            reservaId,
            adminId,
            motivo,
        });

        res.json({
            success: true,
            message: 'Pagamento rejeitado. Usuário foi notificado.',
        });
    } catch (error) {
        next(error);
    }
}

/**
 * ADMIN — lista pagamentos aguardando confirmação do estacionamento do admin logado.
 *
 * GET /api/admin/pagamentos/aguardando-confirmacao
 */
async function listarAguardandoConfirmacao(req, res, next) {
    try {
        const adminId = req.admin?.id;
        const { rows } = await pool.query(
            `SELECT p.id           AS pagamento_id,
                    p.reserva_id,
                    p.valor,
                    p.comprovante_url,
                    p.comprovante_enviado_em,
                    p.created_at,
                    r.placa_veiculo,
                    r.data_entrada_prevista,
                    r.data_saida_prevista,
                    u.nome          AS cliente_nome,
                    u.email         AS cliente_email,
                    e.id            AS estacionamento_id,
                    e.nome          AS estacionamento_nome
               FROM pagamentos p
               JOIN reservas r        ON r.id = p.reserva_id
               JOIN estacionamentos e ON e.id = r.estacionamento_id
               JOIN usuarios u        ON u.id = r.usuario_id
              WHERE e.admin_id        = $1
                AND p.confirmado_em   IS NULL
                AND p.rejeitado_em    IS NULL
                AND p.comprovante_url IS NOT NULL
              ORDER BY p.comprovante_enviado_em ASC`,
            [adminId]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
}

/**
 * ADMIN — entrega o arquivo do comprovante de um pagamento do próprio
 * estacionamento. Comprovantes contêm dados financeiros/pessoais e NÃO são
 * servidos estaticamente; somente por aqui, com RBAC de ownership.
 *
 * GET /api/admin/pagamentos/:id/comprovante
 */
async function baixarComprovante(req, res, next) {
    try {
        const pagamentoId = parseInt(req.params.id, 10);
        const adminId = req.admin?.id;
        if (Number.isNaN(pagamentoId)) throw new BadRequestError('ID do pagamento inválido.');

        const { rows } = await pool.query(
            `SELECT p.comprovante_url, e.admin_id
               FROM pagamentos p
               JOIN reservas r        ON r.id = p.reserva_id
               JOIN estacionamentos e ON e.id = r.estacionamento_id
              WHERE p.id = $1`,
            [pagamentoId]
        );
        if (rows.length === 0) throw new NotFoundError('Pagamento não encontrado.');
        if (parseInt(rows[0].admin_id, 10) !== parseInt(adminId, 10)) {
            throw new AuthorizationError('Você não tem permissão sobre este estacionamento.');
        }
        if (!rows[0].comprovante_url) throw new NotFoundError('Comprovante não enviado.');

        // path.basename impede path traversal: só arquivos do diretório de uploads.
        const filename = path.basename(rows[0].comprovante_url);
        const fullPath = path.join(config.uploads.path, filename);
        if (!fs.existsSync(fullPath)) {
            throw new NotFoundError('Arquivo do comprovante não encontrado.');
        }

        res.set('Cache-Control', 'private, max-age=300');
        res.sendFile(fullPath);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    enviarComprovante,
    confirmarPagamento,
    rejeitarPagamento,
    listarAguardandoConfirmacao,
    baixarComprovante,
};
