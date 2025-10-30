const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');
const emailService = require('../services/emailService');
const notificacaoService = require('../services/notificacaoService');
const logger = require('../utils/logger');
const { FRONTEND_URL } = require('../config');

/**
 * Gera um token seguro para confirmação de pagamento
 * @param {string} reservaId - ID da reserva
 * @param {string} action - Ação (confirmar/cancelar)
 * @returns {string} Token JWT
 */
const generateToken = (reservaId, action) => {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const timestamp = Date.now();
  const payload = `${reservaId}_${action}_${timestamp}`;
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
};

/**
 * Verifica se um token é válido
 * @param {string} token - Token a ser verificado
 * @param {string} reservaId - ID da reserva
 * @param {string} action - Ação (confirmar/cancelar)
 * @returns {boolean} True se o token for válido
 */
const verifyToken = (token, reservaId, action) => {
  try {
    // Verifica se o token expirou (30 minutos)
    const tokenParts = token.split('_');
    if (tokenParts.length !== 3) return false;
    
    const timestamp = parseInt(tokenParts[2], 10);
    const now = Date.now();
    const tokenAge = now - timestamp;
    const MAX_AGE = 30 * 60 * 1000; // 30 minutos
    
    if (tokenAge > MAX_AGE) return false;
    
    // Gera o token esperado e compara
    const expectedToken = generateToken(reservaId, action);
    return crypto.timingSafeEqual(
      Buffer.from(token, 'utf8'),
      Buffer.from(expectedToken, 'utf8')
    );
  } catch (error) {
    logger.error('Erro ao verificar token:', error);
    return false;
  }
};

/**
 * Notifica o estacionamento sobre um pagamento PIX
 * @route POST /api/reservas/:reservaId/notificar-pix
 * @access Private
 */
exports.notificarPagamentoPix = async (req, res) => {
  const { reservaId } = req.params;
  const { tipo, codigoPix } = req.body;
  const userId = req.user.id;

  try {
    // Validação básica
    if (tipo !== 'pix_copiado' || !codigoPix) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de notificação inválido ou código PIX não fornecido'
      });
    }

    // Busca a reserva
    const reserva = await db.Reserva.findByPk(reservaId, {
      include: [
        { model: db.Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] },
        { model: db.Vaga, include: [{ model: db.Estacionamento }] }
      ]
    });

    if (!reserva) {
      return res.status(404).json({
        success: false,
        message: 'Reserva não encontrada'
      });
    }

    // Verifica se o usuário tem permissão
    if (reserva.usuario.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para acessar esta reserva'
      });
    }

    // Gera tokens para confirmação e cancelamento
    const confirmToken = generateToken(reservaId, 'confirmar');
    const cancelToken = generateToken(reservaId, 'cancelar');

    // Atualiza a reserva com o código PIX e status
    await reserva.update({
      codigo_pix: codigoPix,
      status_pagamento: 'aguardando_confirmacao',
      data_notificacao_pix: new Date()
    });

    // Envia e-mail para o estacionamento
    const estacionamento = reserva.Vaga.Estacionamento;
    await emailService.enviarEmailPixCopiado({
      to: estacionamento.email,
      estacionamentoNome: estacionamento.nome,
      clienteNome: reserva.usuario.nome,
      veiculoPlaca: reserva.veiculo_placa || 'Não informada',
      reservaId: reserva.id,
      valor: reserva.valor_total.toFixed(2),
      dataHora: new Date(reserva.data_inicio).toLocaleString('pt-BR'),
      codigoPix,
      confirmToken,
      cancelToken,
      baseUrl: FRONTEND_URL
    });

    // Cria notificação para o estacionamento usando o serviço
    await notificacaoService.criarNotificacao({
      usuario_id: estacionamento.usuario_id,
      tipo: 'pagamento_pendente',
      titulo: 'Pagamento PIX Recebido',
      mensagem: `O cliente ${reserva.usuario.nome} copiou o código PIX para a reserva #${reserva.id}.`,
      dados_adicionais: {
        reservaId: reserva.id,
        tipo: 'pix_copiado',
        codigoPix: codigoPix,
        valor: reserva.valor_total,
        dataHora: new Date().toISOString()
      }
    });

    // Envia notificação em tempo real (se estiver configurado)
    if (req.io) {
      req.io.to(`estacionamento_${estacionamento.id}`).emit('pagamento_pendente', {
        reservaId: reserva.id,
        tipo: 'pix_copiado',
        mensagem: 'Cliente copiou o código PIX. Aguardando confirmação de pagamento.',
        data: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notificação de pagamento PIX enviada com sucesso',
      data: {
        reserva_id: reserva.id,
        status: 'aguardando_confirmacao'
      }
    });
  } catch (error) {
    logger.error('Erro ao notificar pagamento PIX:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar notificação de pagamento PIX',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Confirma o recebimento de um pagamento PIX
 * @route GET /api/reservas/:reservaId/confirmar-pagamento
 * @access Public (protegido por token)
 */
exports.confirmarPagamentoPix = async (req, res) => {
  const { reservaId } = req.params;
  const { token } = req.query;

  try {
    // Valida o token
    if (!token || !verifyToken(token, reservaId, 'confirmar')) {
      return res.status(401).render('error', {
        title: 'Token inválido ou expirado',
        message: 'O link de confirmação é inválido ou expirou.'
      });
    }

    // Busca a reserva
    const reserva = await db.Reserva.findByPk(reservaId, {
      include: [
        { model: db.Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] },
        { model: db.Vaga, include: [{ model: db.Estacionamento }] }
      ]
    });

    if (!reserva) {
      return res.status(404).render('error', {
        title: 'Reserva não encontrada',
        message: 'A reserva informada não foi encontrada.'
      });
    }

    // Atualiza o status da reserva
    await reserva.update({
      status_pagamento: 'pago',
      data_confirmacao_pagamento: new Date()
    });

    // Envia e-mail de confirmação para o cliente
    await emailService.enviarEmailConfirmacaoPagamento({
      to: reserva.usuario.email,
      nome: reserva.usuario.nome,
      reservaId: reserva.id,
      valor: reserva.valor_total,
      dataHora: new Date().toLocaleString('pt-BR'),
      metodoPagamento: 'PIX'
    });

    // Cria notificação para o usuário usando o serviço
    await notificacaoService.criarNotificacao({
      usuario_id: reserva.usuario_id,
      tipo: 'pagamento_confirmado',
      titulo: 'Pagamento Confirmado',
      mensagem: `Seu pagamento para a reserva #${reserva.id} foi confirmado com sucesso!`,
      dados_adicionais: {
        reservaId: reserva.id,
        valor: reserva.valor_total,
        dataHora: new Date().toISOString()
      }
    });

    // Redireciona para a página de sucesso
    return res.redirect(`${FRONTEND_URL}/admin/reservas/${reserva.id}?status=pagamento_confirmado`);
  } catch (error) {
    logger.error('Erro ao confirmar pagamento PIX:', error);
    return res.status(500).render('error', {
      title: 'Erro ao processar confirmação',
      message: 'Ocorreu um erro ao processar a confirmação de pagamento.'
    });
  }
};

/**
 * Cancela uma reserva por falta de pagamento
 * @route GET /api/reservas/:reservaId/cancelar-reserva
 * @access Public (protegido por token)
 */
exports.cancelarReservaPix = async (req, res) => {
  const { reservaId } = req.params;
  const { token } = req.query;

  try {
    // Valida o token
    if (!token || !verifyToken(token, reservaId, 'cancelar')) {
      return res.status(401).render('error', {
        title: 'Token inválido ou expirado',
        message: 'O link de cancelamento é inválido ou expirou.'
      });
    }

    // Busca a reserva
    const reserva = await db.Reserva.findByPk(reservaId, {
      include: [
        { model: db.Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] },
        { model: db.Vaga, include: [{ model: db.Estacionamento }] }
      ]
    });

    if (!reserva) {
      return res.status(404).render('error', {
        title: 'Reserva não encontrada',
        message: 'A reserva informada não foi encontrada.'
      });
    }

    // Atualiza o status da reserva
    await reserva.update({
      status: 'cancelada',
      status_pagamento: 'cancelado',
      data_cancelamento: new Date(),
      motivo_cancelamento: 'Pagamento não efetuado dentro do prazo'
    });

    // Libera a vaga
    await db.Vaga.update(
      { status: 'disponivel' },
      { where: { id: reserva.vaga_id } }
    );

    // Envia e-mail de cancelamento para o cliente
    await emailService.enviarEmailCancelamentoReserva({
      to: reserva.usuario.email,
      nome: reserva.usuario.nome,
      reservaId: reserva.id,
      motivo: 'Pagamento não efetuado dentro do prazo estipulado.'
    });

    // Cria notificação para o usuário usando o serviço
    await notificacaoService.criarNotificacao({
      usuario_id: reserva.usuario_id,
      tipo: 'reserva_cancelada',
      titulo: 'Reserva Cancelada',
      mensagem: `Sua reserva #${reserva.id} foi cancelada por falta de confirmação de pagamento.`,
      dados_adicionais: {
        reservaId: reserva.id,
        motivo: 'Pagamento não confirmado dentro do prazo',
        dataHora: new Date().toISOString()
      }
    });

    // Redireciona para a página de cancelamento
    return res.redirect(`${FRONTEND_URL}/admin/reservas/${reserva.id}?status=reserva_cancelada`);
  } catch (error) {
    logger.error('Erro ao cancelar reserva por falta de pagamento:', error);
    return res.status(500).render('error', {
      title: 'Erro ao processar cancelamento',
      message: 'Ocorreu um erro ao processar o cancelamento da reserva.'
    });
  }
};

/**
 * Tarefa agendada para verificar e cancelar reservas com pagamento PIX expirado
 * @route POST /api/cron/verificar-reservas-expiradas
 * @access Private (protegido por API Key)
 */
exports.verificarReservasExpiradas = async (req, res) => {
  try {
    const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000);
    
    // Encontra reservas com pagamento pendente há mais de 30 minutos
    const reservasExpiradas = await db.Reserva.findAll({
      where: {
        status_pagamento: 'aguardando_confirmacao',
        data_notificacao_pix: { [Op.lte]: trintaMinutosAtras },
        status: { [Op.ne]: 'cancelada' }
      },
      include: [
        { model: db.Usuario, as: 'usuario', attributes: ['id', 'nome', 'email'] },
        { model: db.Vaga, include: [{ model: db.Estacionamento }] }
      ]
    });

    let contador = 0;
    
    // Processa cada reserva expirada
    for (const reserva of reservasExpiradas) {
      try {
        // Atualiza o status da reserva
        await reserva.update({
          status: 'cancelada',
          status_pagamento: 'expirado',
          data_cancelamento: new Date(),
          motivo_cancelamento: 'Pagamento não confirmado dentro do prazo de 30 minutos'
        });

        // Libera a vaga
        await db.Vaga.update(
          { status: 'disponivel' },
          { where: { id: reserva.vaga_id } }
        );

        // Envia e-mail de cancelamento para o cliente
        await emailService.enviarEmailCancelamentoReserva({
          to: reserva.usuario.email,
          nome: reserva.usuario.nome,
          reservaId: reserva.id,
          motivo: 'Pagamento não confirmado dentro do prazo de 30 minutos.'
        });

        // Cria notificação para o usuário usando o serviço
        await notificacaoService.criarNotificacao({
          usuario_id: reserva.usuario_id,
          tipo: 'reserva_expirada',
          titulo: 'Reserva Expirada',
          mensagem: `Sua reserva #${reserva.id} foi cancelada devido ao não pagamento dentro do prazo.`,
          dados_adicionais: {
            reservaId: reserva.id,
            motivo: 'Pagamento não realizado dentro do prazo estipulado',
            dataHora: new Date().toISOString()
          }
        });

        // Envia notificação em tempo real para o cliente (se estiver conectado)
        if (req.io) {
          req.io.to(`usuario_${reserva.usuario_id}`).emit('reserva_expirada', {
            reservaId: reserva.id,
            mensagem: 'Sua reserva foi cancelada por falta de confirmação de pagamento.',
            data: new Date().toISOString()
          });
        }

        contador++;
      } catch (error) {
        logger.error(`Erro ao processar reserva expirada ${reserva.id}:`, error);
        // Continua para a próxima reserva mesmo em caso de erro
      }
    }

    return res.status(200).json({
      success: true,
      reservasProcessadas: contador,
      mensagem: `Foram processadas ${contador} reservas expiradas.`
    });
  } catch (error) {
    logger.error('Erro ao verificar reservas expiradas:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao processar reservas expiradas',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
