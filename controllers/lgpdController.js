// controllers/lgpdController.js
// Controller LGPD — direitos do titular sobre os próprios dados pessoais.
//
// LGPD (Lei 13.709/2018):
//   - art. 18, II  → direito de ACESSO: exportar todos os dados (JSON).
//   - art. 18, VI  → direito de ELIMINAÇÃO: excluir a conta.
//
// A exclusão ANONIMIZA o cadastro (mantém a linha em `usuarios` para não
// quebrar integridade referencial de reservas/pagamentos) e REMOVE os dados
// pessoais que não têm exigência de retenção (veículos, notificações, logs).
// Registros financeiros (reservas/pagamentos) são preservados já desvinculados
// de identidade — retenção fiscal/contábil, exceção legítima do art. 16.

const argon2 = require('argon2');
const { pool } = require('../utils/dbUtils');
const { invalidateUserCache } = require('../middleware/authMiddleware');
const { BadRequestError, NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

// Frase exata que o titular deve enviar para confirmar a exclusão. Evita
// exclusão acidental (e exige intenção explícita além do token válido).
const CONFIRMACAO_EXCLUSAO = 'EXCLUIR MINHA CONTA';

/**
 * SELECT tolerante: se a tabela/coluna não existir naquele ambiente, devolve
 * lista vazia em vez de derrubar a exportação inteira. (Best-effort com log.)
 * @returns {Promise<Array>}
 */
async function selectSafe(sql, params, contexto) {
    try {
        const { rows } = await pool.query(sql, params);
        return rows;
    } catch (err) {
        logger.warn(`[LGPD] Falha ao ler ${contexto} na exportação`, { error: err.message });
        return [];
    }
}

/**
 * GET /api/lgpd/export
 * Devolve, como arquivo JSON para download, todos os dados pessoais do titular
 * autenticado (dados cadastrais, veículos, reservas, notificações, pagamentos).
 */
async function exportarDados(req, res, next) {
    try {
        const userId = req.user.id;

        // Dados cadastrais — SEM segredos (senha/tokens ficam de fora).
        const titular = await pool.query(
            `SELECT id, nome, email, cpf, telefone, tipo_usuario, status,
                    tipo_veiculo, placa_veiculo, data_cadastro, ultimo_acesso
               FROM usuarios
              WHERE id = $1`,
            [userId]
        );
        if (titular.rows.length === 0) {
            throw new NotFoundError('Usuário não encontrado');
        }

        const [veiculos, reservas, notificacoes, pagamentos] = await Promise.all([
            selectSafe('SELECT * FROM veiculos WHERE usuario_id = $1 ORDER BY id', [userId], 'veiculos'),
            selectSafe('SELECT * FROM reservas WHERE usuario_id = $1 ORDER BY id', [userId], 'reservas'),
            selectSafe('SELECT * FROM notificacoes WHERE usuario_id = $1 ORDER BY id', [userId], 'notificacoes'),
            selectSafe('SELECT * FROM pagamentos WHERE id_usuario = $1 ORDER BY id', [userId], 'pagamentos'),
        ]);

        const dump = {
            geradoEm: new Date().toISOString(),
            aviso: 'Exportação de dados pessoais (LGPD art. 18, II). Guarde este arquivo com segurança.',
            titular: titular.rows[0],
            veiculos,
            reservas,
            notificacoes,
            pagamentos,
        };

        logger.info('[LGPD] Exportação de dados solicitada', { usuarioId: userId });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="parknow-meus-dados.json"');
        return res.status(200).send(JSON.stringify(dump, null, 2));
    } catch (error) {
        return next(error);
    }
}

/**
 * DELETE /api/lgpd/account
 * Anonimiza o cadastro do titular e remove seus dados pessoais. Exige a frase
 * de confirmação no corpo. Transação: ou tudo, ou nada.
 */
async function excluirConta(req, res, next) {
    const userId = req.user.id;
    const { confirmacao } = req.body || {};

    if (confirmacao !== CONFIRMACAO_EXCLUSAO) {
        return next(
            new BadRequestError(
                `Confirmação inválida. Envie {"confirmacao": "${CONFIRMACAO_EXCLUSAO}"} para excluir a conta.`
            )
        );
    }

    // Hash argon2 de um valor aleatório: a senha fica inutilizável (o login usa
    // argon2.verify e retornará false), sem deixar hash conhecido.
    const senhaInutilizavel = await argon2.hash(`deleted:${userId}:${Date.now()}:${Math.random()}`);
    const emailAnonimo = `excluido-${userId}@lgpd.parknow.invalid`;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Dados pessoais sem exigência de retenção: remoção completa.
        await client.query('DELETE FROM veiculos WHERE usuario_id = $1', [userId]);
        await client.query('DELETE FROM notificacoes WHERE usuario_id = $1', [userId]);
        await client.query('DELETE FROM logs_veiculos WHERE usuario_id = $1', [userId]);

        // Anonimiza o cadastro (linha preservada por integridade referencial).
        const { rowCount } = await client.query(
            `UPDATE usuarios
                SET nome = '(conta excluída)',
                    email = $2,
                    cpf = NULL,
                    telefone = NULL,
                    senha = $3,
                    tipo_veiculo = NULL,
                    placa_veiculo = NULL,
                    foto_perfil = NULL,
                    reset_token = NULL,
                    refresh_token_hash = NULL,
                    status = 'excluida'
              WHERE id = $1`,
            [userId, emailAnonimo, senhaInutilizavel]
        );

        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return next(new NotFoundError('Usuário não encontrado'));
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        return next(error);
    } finally {
        client.release();
    }

    // Invalida o cache de usuário do middleware de auth (o token atual deixa de
    // resolver para um titular válido).
    invalidateUserCache(userId);
    logger.info('[LGPD] Conta excluída/anonimizada', { usuarioId: userId });

    return res.status(200).json({
        success: true,
        message: 'Sua conta foi excluída. Seus dados pessoais foram removidos ou anonimizados.',
    });
}

module.exports = { exportarDados, excluirConta, CONFIRMACAO_EXCLUSAO };
