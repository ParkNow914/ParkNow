const logger = require('../utils/logger');
const { sendEmail } = require('../utils/emailUtils');
const { format } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const config = require('../config');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const pug = require('pug');

class EmailService {
  /**
   * Envia um email de notificação genérico
   * @param {Object} options - Opções do email
   * @param {string} options.to - Email do destinatário
   * @param {string} options.subject - Assunto do email
   * @param {string} options.template - Nome do template a ser usado
   * @param {Object} options.data - Dados para o template
   */
  async enviarEmailGenerico({ to, subject, template, data = {} }) {
    try {
      // Implementação básica - pode ser estendida para suportar templates
      const text = data.text || 'Notificação do ParkNow';
      const html = data.html || `<p>${text}</p>`;

      await sendEmail({
        to,
        subject,
        text,
        html
      });

      logger.info(`Email enviado para ${to} com o assunto: ${subject}`);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar email genérico:', error);
      throw error;
    }
  }

  /**
   * Envia um email de notificação quando o cliente solicita pagamento via PIX
   * @param {Object} options - Opções do email
   * @param {string} options.to - Email do destinatário (estacionamento)
   * @param {string} options.estacionamentoNome - Nome do estacionamento
   * @param {string} options.clienteNome - Nome do cliente
   * @param {string} options.veiculoPlaca - Placa do veículo
   * @param {string} options.reservaId - ID da reserva
   * @param {string} options.valor - Valor da reserva formatado
   * @param {string} options.dataHora - Data e hora da reserva formatada
   * @param {string} options.codigoPix - Chave PIX para pagamento
   * @param {string} options.tokenConfirmacao - Token para confirmação do pagamento
   * @param {string} options.tokenCancelamento - Token para cancelamento da reserva
   * @param {string} options.urlBase - URL base da API
   */
  async enviarEmailPixCopiado({ 
    to, 
    estacionamentoNome, 
    clienteNome, 
    veiculoPlaca, 
    reservaId, 
    valor, 
    dataHora, 
    codigoPix,
    tokenConfirmacao,
    tokenCancelamento,
    urlBase = process.env.API_URL || 'http://localhost:3000'
  }) {
    try {
      const templatePath = path.join(__dirname, '../views/emails/pixCopiado.pug');
      const html = pug.renderFile(templatePath, {
        estacionamentoNome,
        clienteNome,
        veiculoPlaca,
        reservaId,
        valor,
        dataHora,
        codigoPix,
        tokenConfirmacao,
        tokenCancelamento,
        urlBase
      });

      await sendEmail({
        to,
        subject: `Solicitação de Pagamento PIX - Reserva #${reservaId} - ParkNow`,
        html,
        text: `Um cliente solicitou o pagamento via PIX para a reserva #${reservaId}. Valor: ${valor}. Chave PIX: ${codigoPix}`
      });

      logger.info(`Notificação de pagamento PIX enviada para ${to} para a reserva #${reservaId}`);
      return true;
    } catch (error) {
      logger.error('Erro ao enviar notificação de pagamento PIX:', error);
      throw error;
    }
  }

  /**
   * Envia um email de confirmação de pagamento
   * @param {Object} options - Opções do email
   * @param {string} options.to - Email do destinatário
   * @param {Object} options.pagamento - Dados do pagamento
   * @param {Object} options.reserva - Dados da reserva
   */
  async enviarEmailConfirmacaoPagamento({ to, pagamento, reserva, usuario }) {
    try {
      const formatarData = (data) => {
        return format(new Date(data), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
      };

      const formatarMoeda = (valor) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(valor);
      };

      const assunto = 'Pagamento Confirmado - ParkNow';
      const nomeUsuario = usuario?.nome || 'Cliente';
      const valorFormatado = formatarMoeda(pagamento.transaction_amount);
      const dataPagamento = formatarData(pagamento.date_approved || new Date());
      const metodoPagamento = this.obterDescricaoMetodoPagamento(pagamento.payment_method_id);
      
      let detalhesPagamento = `
        <p><strong>Valor:</strong> ${valorFormatado}</p>
        <p><strong>Método de pagamento:</strong> ${metodoPagamento}</p>
        <p><strong>Data do pagamento:</strong> ${dataPagamento}</p>
        <p><strong>ID da transação:</strong> ${pagamento.id}</p>
      `;

      if (pagamento.payment_method_id === 'pix' && pagamento.point_of_interaction?.transaction_data) {
        const pixData = pagamento.point_of_interaction.transaction_data;
        if (pixData.qr_code) {
          detalhesPagamento += `
            <p><strong>Código PIX:</strong> ${pixData.qr_code}</p>
            <p><strong>Chave PIX:</strong> ${pixData.ticket_url || 'Não disponível'}</p>
          `;
        }
      } else if (pagamento.payment_method_id === 'credit_card' || pagamento.payment_method_id === 'debit_card') {
        const cardData = pagamento.card || {};
        detalhesPagamento += `
          <p><strong>Cartão:</strong> ${cardData.last_four_digits ? `Terminado em ${cardData.last_four_digits}` : 'Não disponível'}</p>
          <p><strong>Parcelas:</strong> ${pagamento.installments || 1}x</p>
        `;
      }

      let detalhesReserva = '';
      if (reserva) {
        detalhesReserva = `
          <h3>Detalhes da Reserva</h3>
          <p><strong>Estacionamento:</strong> ${reserva.estacionamento?.nome || 'Não disponível'}</p>
          <p><strong>Endereço:</strong> ${reserva.estacionamento?.endereco || 'Não disponível'}</p>
          <p><strong>Vaga:</strong> ${reserva.vaga?.numero || 'Não disponível'}</p>
          <p><strong>Placa do veículo:</strong> ${reserva.placa_veiculo || 'Não informada'}</p>
          <p><strong>Entrada:</strong> ${formatarData(reserva.horario_inicio_reserva)}</p>
          <p><strong>Saída prevista:</strong> ${formatarData(reserva.horario_fim_reserva)}</p>
        `;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${assunto}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
            .header { background-color: #4CAF50; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; }
            .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px; color: #777; text-align: center; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background-color: #4CAF50; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 15px 0;
            }
            .details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Pagamento Confirmado!</h1>
            </div>
            <div class="content">
              <p>Olá, ${nomeUsuario}!</p>
              <p>Seu pagamento foi confirmado com sucesso. Agradecemos por utilizar nossos serviços.</p>
              
              <div class="details">
                <h3>Detalhes do Pagamento</h3>
                ${detalhesPagamento}
              </div>
              
              ${detalhesReserva}
              
              <p>Se você tiver alguma dúvida ou precisar de ajuda, entre em contato conosco.</p>
              
              <p>Atenciosamente,<br>Equipe ParkNow</p>
              
              <div style="text-align: center; margin-top: 20px;">
                <a href="${process.env.FRONTEND_URL || 'https://parknow.com.br'}" class="button">Acessar Minha Conta</a>
              </div>
            </div>
            <div class="footer">
              <p>Este é um e-mail automático, por favor não responda a esta mensagem.</p>
              <p>© ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const text = `Olá ${nomeUsuario},\n\nSeu pagamento no valor de ${valorFormatado} foi confirmado com sucesso.\n\n` +
        `Método de pagamento: ${metodoPagamento}\n` +
        `Data do pagamento: ${dataPagamento}\n` +
        `ID da transação: ${pagamento.id}\n\n` +
        (reserva ? `Detalhes da reserva:\n` +
        `Estacionamento: ${reserva.estacionamento?.nome || 'Não disponível'}\n` +
        `Endereço: ${reserva.estacionamento?.endereco || 'Não disponível'}\n` +
        `Vaga: ${reserva.vaga?.numero || 'Não disponível'}\n` +
        `Placa do veículo: ${reserva.placa_veiculo || 'Não informada'}\n` +
        `Entrada: ${formatarData(reserva.horario_inicio_reserva)}\n` +
        `Saída prevista: ${formatarData(reserva.horario_fim_reserva)}\n\n` : '') +
        `Atenciosamente,\nEquipe ParkNow`;

      await this.enviarEmailGenerico({
        to,
        subject: assunto,
        data: { html, text }
      });

      return true;
    } catch (error) {
      logger.error('Erro ao enviar email de confirmação de pagamento:', error);
      throw error;
    }
  }

  /**
   * Envia um email de notificação de status de pagamento
   * @param {Object} options - Opções do email
   * @param {string} options.to - Email do destinatário
   * @param {string} options.status - Status do pagamento
   * @param {Object} options.pagamento - Dados do pagamento
   * @param {Object} options.reserva - Dados da reserva
   */
  async enviarEmailStatusPagamento({ to, status, pagamento, reserva, usuario }) {
    try {
      const formatarData = (data) => {
        return format(new Date(data), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
      };

      const formatarMoeda = (valor) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(valor);
      };

      const statusMap = {
        'approved': { title: 'Aprovado', message: 'seu pagamento foi aprovado com sucesso' },
        'pending': { title: 'Pendente', message: 'seu pagamento está em processamento' },
        'in_process': { title: 'Em Análise', message: 'seu pagamento está em análise' },
        'rejected': { title: 'Recusado', message: 'seu pagamento foi recusado' },
        'cancelled': { title: 'Cancelado', message: 'seu pagamento foi cancelado' },
        'refunded': { title: 'Reembolsado', message: 'seu pagamento foi reembolsado' },
        'chargedback': { title: 'Estornado', message: 'seu pagamento foi estornado' },
        'in_mediation': { title: 'Em Mediação', message: 'seu pagamento está em mediação' },
        'default': { title: 'Atualização', message: 'houve uma atualização no status do seu pagamento' }
      };

      const statusInfo = statusMap[status] || statusMap['default'];
      const assunto = `Pagamento ${statusInfo.title} - ParkNow`;
      const nomeUsuario = usuario?.nome || 'Cliente';
      const valorFormatado = formatarMoeda(pagamento.transaction_amount);
      const dataAtualizacao = formatarData(pagamento.date_last_updated || new Date());
      
      let detalhesPagamento = `
        <p><strong>Valor:</strong> ${valorFormatado}</p>
        <p><strong>Status:</strong> ${statusInfo.title}</p>
        <p><strong>Data da atualização:</strong> ${dataAtualizacao}</p>
        <p><strong>ID da transação:</strong> ${pagamento.id}</p>
      `;

      if (status === 'rejected') {
        detalhesPagamento += `
          <p><strong>Motivo da recusa:</strong> ${pagamento.status_detail || 'Não especificado'}</p>
          <p>Se você acredita que houve um engano, entre em contato com nossa equipe de suporte.</p>
        `;
      }

      let detalhesReserva = '';
      if (reserva) {
        detalhesReserva = `
          <h3>Detalhes da Reserva</h3>
          <p><strong>Estacionamento:</strong> ${reserva.estacionamento?.nome || 'Não disponível'}</p>
          <p><strong>Endereço:</strong> ${reserva.estacionamento?.endereco || 'Não disponível'}</p>
          <p><strong>Vaga:</strong> ${reserva.vaga?.numero || 'Não disponível'}</p>
          <p><strong>Placa do veículo:</strong> ${reserva.placa_veiculo || 'Não informada'}</p>
          <p><strong>Entrada:</strong> ${formatarData(reserva.horario_inicio_reserva)}</p>
          <p><strong>Saída prevista:</strong> ${formatarData(reserva.horario_fim_reserva)}</p>
        `;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${assunto}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
            .header { 
              background-color: ${status === 'approved' ? '#4CAF50' : status === 'rejected' ? '#f44336' : '#2196F3'}; 
              color: white; 
              padding: 15px; 
              text-align: center; 
              border-radius: 5px 5px 0 0; 
            }
            .content { padding: 20px; }
            .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px; color: #777; text-align: center; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background-color: #4CAF50; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 15px 0;
            }
            .details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Pagamento ${statusInfo.title.toUpperCase()}</h1>
            </div>
            <div class="content">
              <p>Olá, ${nomeUsuario}!</p>
              <p>Informamos que ${statusInfo.message}.</p>
              
              <div class="details">
                <h3>Detalhes do Pagamento</h3>
                ${detalhesPagamento}
              </div>
              
              ${detalhesReserva}
              
              <p>Se você tiver alguma dúvida ou precisar de ajuda, entre em contato conosco.</p>
              
              <p>Atenciosamente,<br>Equipe ParkNow</p>
              
              <div style="text-align: center; margin-top: 20px;">
                <a href="${process.env.FRONTEND_URL || 'https://parknow.com.br'}" class="button">Acessar Minha Conta</a>
              </div>
            </div>
            <div class="footer">
              <p>Este é um e-mail automático, por favor não responda a esta mensagem.</p>
              <p>© ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const text = `Olá ${nomeUsuario},\n\nInformamos que ${statusInfo.message}.\n\n` +
        `Detalhes do pagamento:\n` +
        `Valor: ${valorFormatado}\n` +
        `Status: ${statusInfo.title}\n` +
        `Data da atualização: ${dataAtualizacao}\n` +
        `ID da transação: ${pagamento.id}\n\n` +
        (status === 'rejected' ? `Motivo da recusa: ${pagamento.status_detail || 'Não especificado'}\n\n` : '') +
        (reserva ? `Detalhes da reserva:\n` +
        `Estacionamento: ${reserva.estacionamento?.nome || 'Não disponível'}\n` +
        `Endereço: ${reserva.estacionamento?.endereco || 'Não disponível'}\n` +
        `Vaga: ${reserva.vaga?.numero || 'Não disponível'}\n` +
        `Placa do veículo: ${reserva.placa_veiculo || 'Não informada'}\n` +
        `Entrada: ${formatarData(reserva.horario_inicio_reserva)}\n` +
        `Saída prevista: ${formatarData(reserva.horario_fim_reserva)}\n\n` : '') +
        `Atenciosamente,\nEquipe ParkNow`;

      await this.enviarEmailGenerico({
        to,
        subject: assunto,
        data: { html, text }
      });

      return true;
    } catch (error) {
      logger.error('Erro ao enviar email de status de pagamento:', error);
      throw error;
    }
  }

  /**
   * Obtém a descrição amigável do método de pagamento
   * @param {string} paymentMethodId - ID do método de pagamento
   * @returns {string} Descrição do método de pagamento
   */
  obterDescricaoMetodoPagamento(paymentMethodId) {
    const metodos = {
      'pix': 'PIX',
      'credit_card': 'Cartão de Crédito',
      'debit_card': 'Cartão de Débito',
      'ticket': 'Boleto Bancário',
      'bank_transfer': 'Transferência Bancária',
      'atm': 'Caixa Eletrônico',
      'prepaid_card': 'Cartão Pré-pago'
    };

    return metodos[paymentMethodId] || paymentMethodId || 'Método não especificado';
  }

  /**
   * Envia um email de notificação de status de pagamento
   * @param {Object} options - Opções do email
   * @param {string} options.to - Email do destinatário
   * @param {string} options.status - Status do pagamento (approved, pending, rejected, etc.)
   * @param {Object} options.pagamento - Dados do pagamento
   * @param {Object} options.reserva - Dados da reserva
   * @param {Object} options.usuario - Dados do usuário
   */
  async enviarEmailStatusPagamento({ to, status, pagamento, reserva, usuario }) {
    try {
      const formatarData = (data) => {
        if (!data) return 'Não disponível';
        return format(new Date(data), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
      };

      const formatarMoeda = (valor) => {
        if (valor === undefined || valor === null) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(valor);
      };

      // Mapeamento de status para mensagens amigáveis
      const statusMensagens = {
        'approved': {
          assunto: 'Pagamento Aprovado - ParkNow',
          titulo: 'Seu pagamento foi aprovado!',
          mensagem: 'Seu pagamento foi processado com sucesso e sua reserva está confirmada.'
        },
        'pending': {
          assunto: 'Pagamento em Análise - ParkNow',
          titulo: 'Seu pagamento está em análise',
          mensagem: 'Estamos aguardando a confirmação do seu pagamento. Você receberá um e-mail quando o status for atualizado.'
        },
        'in_process': {
          assunto: 'Pagamento em Processamento - ParkNow',
          titulo: 'Seu pagamento está em processamento',
          mensagem: 'Seu pagamento está sendo processado pelo nosso sistema. Você receberá uma notificação quando a confirmação for concluída.'
        },
        'rejected': {
          assunto: 'Pagamento Recusado - ParkNow',
          titulo: 'Seu pagamento foi recusado',
          mensagem: 'Não foi possível processar seu pagamento. Por favor, verifique os dados e tente novamente ou entre em contato com seu banco.'
        },
        'cancelled': {
          assunto: 'Pagamento Cancelado - ParkNow',
          titulo: 'Seu pagamento foi cancelado',
          mensagem: 'Seu pagamento foi cancelado. Se você não solicitou este cancelamento, entre em contato com nosso suporte.'
        },
        'refunded': {
          assunto: 'Reembolso Efetuado - ParkNow',
          titulo: 'Seu reembolso foi processado',
          mensagem: 'O valor do seu pagamento foi reembolsado conforme solicitado.'
        },
        'in_mediation': {
          assunto: 'Pagamento em Mediação - ParkNow',
          titulo: 'Seu pagamento está em mediação',
          mensagem: 'Seu pagamento está em processo de mediação. Entraremos em contato em breve com mais informações.'
        }
      };

      const statusInfo = statusMensagens[status] || {
        assunto: 'Atualização de Pagamento - ParkNow',
        titulo: `Status do Pagamento: ${status}`,
        mensagem: 'O status do seu pagamento foi atualizado.'
      };

      const nomeUsuario = usuario?.nome || 'Cliente';
      const valorFormatado = formatarMoeda(pagamento?.transaction_amount);
      const dataAtualizacao = formatarData(pagamento?.date_last_updated || new Date());
      const metodoPagamento = this.obterDescricaoMetodoPagamento(pagamento?.payment_method_id);
      
      let detalhesPagamento = '';
      if (pagamento) {
        detalhesPagamento = `
          <p><strong>ID da transação:</strong> ${pagamento.id || 'Não disponível'}</p>
          <p><strong>Valor:</strong> ${valorFormatado}</p>
          <p><strong>Método de pagamento:</strong> ${metodoPagamento}</p>
          <p><strong>Status:</strong> ${pagamento.status || 'Não disponível'}</p>
          <p><strong>Última atualização:</strong> ${dataAtualizacao}</p>
        `;

        if (pagamento.status_detail) {
          detalhesPagamento += `<p><strong>Detalhe do status:</strong> ${pagamento.status_detail}</p>`;
        }
      }

      let detalhesReserva = '';
      if (reserva) {
        detalhesReserva = `
          <h3 style="color: #2c3e50; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Detalhes da Reserva</h3>
          <p><strong>Número da reserva:</strong> ${reserva.id || 'Não disponível'}</p>
          <p><strong>Estacionamento:</strong> ${reserva.estacionamento?.nome || 'Não disponível'}</p>
          <p><strong>Endereço:</strong> ${reserva.estacionamento?.endereco || 'Não disponível'}</p>
          <p><strong>Vaga:</strong> ${reserva.vaga?.numero || 'Não disponível'}</p>
          <p><strong>Placa do veículo:</strong> ${reserva.placa_veiculo || 'Não informada'}</p>
          <p><strong>Entrada:</strong> ${formatarData(reserva.horario_inicio_reserva)}</p>
          <p><strong>Saída prevista:</strong> ${formatarData(reserva.horario_fim_reserva)}</p>
        `;
      }

      const botaoAcao = status === 'approved' ? 
        '<a href="#" style="display: inline-block; padding: 12px 24px; background-color: #2ecc71; color: #ffffff; text-decoration: none; border-radius: 4px; margin: 20px 0;">Acessar Minha Reserva</a>' : 
        '';

      const mensagemAdicional = status === 'rejected' ? 
        '<p style="color: #e74c3c; font-style: italic;">Se você acredita que houve um engano, entre em contato com nosso suporte.</p>' :
        '';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${statusInfo.assunto}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #3498db; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
            .status-box { 
              background-color: #f8f9fa; 
              border-left: 4px solid #3498db; 
              padding: 15px; 
              margin: 15px 0; 
              border-radius: 0 4px 4px 0;
            }
            .footer { margin-top: 30px; font-size: 12px; color: #7f8c8d; text-align: center; }
            .button { 
              display: inline-block; 
              padding: 10px 20px; 
              background-color: #3498db; 
              color: white; 
              text-decoration: none; 
              border-radius: 4px; 
              margin: 10px 0; 
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${statusInfo.titulo}</h1>
          </div>
          <div class="content">
            <p>Olá, ${nomeUsuario}!</p>
            
            <div class="status-box">
              <p>${statusInfo.mensagem}</p>
              ${mensagemAdicional}
            </div>

            <h3>Detalhes do Pagamento</h3>
            ${detalhesPagamento}
            
            ${detalhesReserva}
            
            <div style="text-align: center; margin: 25px 0;">
              ${botaoAcao}
            </div>
            
            <p>Se você tiver alguma dúvida ou precisar de ajuda, entre em contato com nosso suporte.</p>
            
            <p>Atenciosamente,<br>Equipe ParkNow</p>
          </div>
          <div class="footer">
            <p>Este é um e-mail automático, por favor não responda a esta mensagem.</p>
            <p>© ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.</p>
          </div>
        </body>
        </html>
      `;

      // Versão em texto simples para clientes de e-mail que não suportam HTML
      const text = `
        ${statusInfo.titulo}
        
        Olá, ${nomeUsuario}!
        
        ${statusInfo.mensagem}
        ${status === 'rejected' ? '\nSe você acredita que houve um engano, entre em contato com nosso suporte.' : ''}
        
        DETALHES DO PAGAMENTO
        ------------------------
        ID da transação: ${pagamento?.id || 'Não disponível'}
        Valor: ${valorFormatado}
        Método de pagamento: ${metodoPagamento}
        Status: ${pagamento?.status || 'Não disponível'}
        Última atualização: ${dataAtualizacao}
        ${pagamento?.status_detail ? `Detalhe do status: ${pagamento.status_detail}` : ''}
        
        ${reserva ? `
        DETALHES DA RESERVA
        -------------------
        Número da reserva: ${reserva.id || 'Não disponível'}
        Estacionamento: ${reserva.estacionamento?.nome || 'Não disponível'}
        Endereço: ${reserva.estacionamento?.endereco || 'Não disponível'}
        Vaga: ${reserva.vaga?.numero || 'Não disponível'}
        Placa do veículo: ${reserva.placa_veiculo || 'Não informada'}
        Entrada: ${formatarData(reserva.horario_inicio_reserva)}
        Saída prevista: ${formatarData(reserva.horario_fim_reserva)}
        ` : ''}
        
        Atenciosamente,
        Equipe ParkNow
        
        ---
        Este é um e-mail automático, por favor não responda a esta mensagem.
        ${new Date().getFullYear()} ParkNow. Todos os direitos reservados.
      `;

      // Envia o e-mail
      await this.enviarEmailGenerico({
        to,
        subject: statusInfo.assunto,
        data: { html, text }
      });

      logger.info(`E-mail de status de pagamento enviado para ${to}`, { 
        paymentId: pagamento?.id, 
        status,
        userId: usuario?.id 
      });

      return true;
    } catch (error) {
      logger.error('Erro ao enviar e-mail de status de pagamento:', {
        error: error.message,
        stack: error.stack,
        paymentId: pagamento?.id,
        status,
        userId: usuario?.id
      });
      throw error;
    }
  }

  /**
   * Envia email de confirmação de pagamento PIX pendente para o dono do estacionamento
   * @param {Object} options - Opções do email
   * @param {string} options.para - Email do dono do estacionamento
   * @param {Object} options.dados - Dados para o template
   * @param {string} options.dados.nomeEstacionamento - Nome do estacionamento
   * @param {string} options.dados.codigoReserva - Código da reserva
   * @param {string} options.dados.codigoConfirmacao - Código de confirmação
   * @param {number} options.dados.valor - Valor do pagamento
   * @param {string} options.dados.placaVeiculo - Placa do veículo
   * @param {string} options.dados.periodo - Período da reserva
   */
  async enviarEmailConfirmacaoPendente({ para, dados }) {
    try {
      const templatePath = path.join(
        __dirname,
        '../templates/email/confirmacaoPixPendente.hbs'
      );
      
      // Lê o template do arquivo
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateSource);
      
      // Adiciona a URL base aos dados do template
      const templateData = {
        ...dados,
        baseUrl: config.app.baseUrl || 'https://parknow.com.br'
      };
      
      // Renderiza o template com os dados
      const html = template(templateData);
      
      // Envia o email
      await sendEmail({
        to: para,
        subject: `[ParkNow] Confirmação de Pagamento PIX - Reserva ${dados.codigoReserva}`,
        html,
        text: `Nova solicitação de reserva recebida. Acesse o painel para mais detalhes.`
      });
      
      logger.info(`Email de confirmação PIX pendente enviado para ${para}`, {
        reservaId: dados.codigoReserva
      });
      
      return true;
    } catch (error) {
      logger.error('Erro ao enviar email de confirmação PIX pendente:', {
        error: error.message,
        stack: error.stack,
        email: para
      });
      throw error;
    }
  }
}

/**
 * Envia um e-mail de notificação quando uma reserva é cancelada
 * @param {Object} options - Opções do e-mail
 * @param {string} options.nome - Nome do destinatário
 * @param {string} options.email - Email do destinatário
 * @param {string|number} options.reservaId - ID da reserva cancelada
 * @param {string|Date} options.dataReserva - Data da reserva
 * @param {string} options.motivo - Motivo do cancelamento
 * @param {string} [urlBase] - URL base da aplicação
 */
EmailService.prototype.enviarEmailCancelamentoReserva = async function({ 
  nome, 
  email, 
  reservaId, 
  dataReserva, 
  motivo,
  urlBase = process.env.FRONTEND_URL || 'http://localhost:3000' 
}) {
  try {
    // Formata a data para exibição
    const dataFormatada = format(new Date(dataReserva), "dd/MM/yyyy 'às' HH:mm", {
      locale: ptBR
    });

    // Renderiza o template de e-mail
    const templatePath = path.join(__dirname, '../views/emails/reservaCancelada.pug');
    const html = pug.renderFile(templatePath, {
      nome,
      reservaId,
      dataReserva: dataFormatada,
      motivo,
      urlBase
    });

    // Envia o e-mail
    await sendEmail({
      to: email,
      subject: `Cancelamento da Reserva #${reservaId} - ParkNow`,
      html,
      text: `Sua reserva #${reservaId} foi cancelada. Motivo: ${motivo}.`
    });

    logger.info(`E-mail de cancelamento enviado para ${email} (Reserva #${reservaId})`);
    return true;
  } catch (error) {
    logger.error('Erro ao enviar e-mail de cancelamento de reserva:', {
      error: error.message,
      reservaId,
      email,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = new EmailService();
