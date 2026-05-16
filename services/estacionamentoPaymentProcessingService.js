const logger = require('../utils/logger');
const db = require('../config/database');
const { AppError } = require('../utils/AppError');
const { PAYMENT_STATUS, PAYMENT_METHODS } = require('../config/constants');
const estacionamentoModel = require('../models/estacionamentoModel');
const reservaModel = require('../models/reservaModel');
const pagamentoModel = require('../models/pagamentoModel');
const notificationService = require('./notificationService');
const { formatCurrency } = require('../utils/formatters');
// PIX manual removido - usar apenas ASAAS
const _QRCode = require('qrcode');

class EstacionamentoPaymentProcessingService {
    /**
     * Processa um pagamento para uma reserva
     * @param {number} reservaId - ID da reserva
     * @param {string} metodoPagamento - Método de pagamento (pix, cartao_credito, etc)
     * @param {object} dadosPagamento - Dados específicos do pagamento
     * @param {object} [client] - Cliente de banco de dados opcional para transação
     * @returns {Promise<object>} Resultado do processamento do pagamento
     */
    async processarPagamento(reservaId, metodoPagamento, dadosPagamento, client = db) {
        let connection;

        try {
            // Inicia uma transação se não for fornecida
            if (!client) {
                connection = await db.transaction();
                client = connection;
            }

            // Busca a reserva
            const reserva = await reservaModel.findReservaById(reservaId, client);
            if (!reserva) {
                throw new AppError('Reserva não encontrada', 404);
            }

            // Verifica se a reserva já foi paga
            if (reserva.status_pagamento === PAYMENT_STATUS.APROVADO) {
                return {
                    success: true,
                    jaPago: true,
                    status: PAYMENT_STATUS.APROVADO,
                    mensagem: 'Esta reserva já foi paga'
                };
            }

            // Busca os dados do estacionamento
            const estacionamento = await estacionamentoModel.findById(reserva.estacionamento_id, client);
            if (!estacionamento) {
                throw new AppError('Estacionamento não encontrado', 404);
            }

            // Calcula o valor total da reserva
            const valorTotal = await reservaModel.calcularValorReserva(
                reserva.horario_inicio_reserva,
                reserva.horario_fim_reserva,
                estacionamento.preco_hora,
                client
            );

            // Processa o pagamento de acordo com o método
            let resultadoPagamento;

            switch (metodoPagamento) {
                case PAYMENT_METHODS.PIX:
                    resultadoPagamento = await this.processarPagamentoPix(
                        reserva,
                        estacionamento,
                        valorTotal,
                        dadosPagamento,
                        client
                    );
                    break;

                case PAYMENT_METHODS.CARTAO_CREDITO:
                case PAYMENT_METHODS.CARTAO_DEBITO:
                    resultadoPagamento = await this.processarPagamentoCartao(
                        reserva,
                        estacionamento,
                        valorTotal,
                        metodoPagamento,
                        dadosPagamento,
                        client
                    );
                    break;

                case PAYMENT_METHODS.DINHEIRO:
                    resultadoPagamento = await this.processarPagamentoDinheiro(
                        reserva,
                        estacionamento,
                        valorTotal,
                        dadosPagamento,
                        client
                    );
                    break;

                default:
                    throw new AppError(`Método de pagamento não suportado: ${metodoPagamento}`, 400);
            }

            // Confirma a transação se iniciada neste método
            if (connection) {
                await connection.commit();
            }

            return {
                success: true,
                ...resultadoPagamento
            };

        } catch (error) {
            // Desfaz as alterações em caso de erro
            if (connection) {
                await connection.rollback();
            }

            logger.error('Erro ao processar pagamento:', {
                error: error.message,
                stack: error.stack,
                reservaId,
                metodoPagamento,
                dadosPagamento: this.ocultarDadosSensiveis(dadosPagamento)
            });

            throw error;
        } finally {
            // Libera o cliente de volta para o pool
            if (connection) {
                connection.release();
            }
        }
    }

    /**
     * Processa um pagamento via PIX
     * @private
     */
    async processarPagamentoPix(reserva, estacionamento, valorTotal, dadosPagamento, client) {
        // Verifica se o estacionamento está configurado para receber PIX
        const configPagamento = await estacionamentoModel.validarConfiguracaoPagamento(estacionamento.id, client);

        if (!configPagamento.valido) {
            throw new AppError(`Este estacionamento não está configurado para receber pagamentos via PIX: ${configPagamento.motivo}`, 400);
        }

        // Gera o QR Code PIX REAL usando a biblioteca pix-utils
        const qrCodeData = await this.gerarQrCodePix({
            chavePix: configPagamento.config.chave_pix,
            nomeTitular: configPagamento.config.nome_titular,
            valor: valorTotal,
            descricao: `Estacionamento ${estacionamento.nome} - Reserva #${reserva.id}`,
            cidade: estacionamento.cidade || 'SAO PAULO',
            txid: `PARKNOW${Date.now()}${Math.floor(Math.random() * 1000)}`
        });

        // Cria o registro de pagamento
        const pagamentoId = await pagamentoModel.criarPagamento({
            reserva_id: reserva.id,
            id_usuario: reserva.usuario_id,
            id_estacionamento: estacionamento.id,
            metodo: PAYMENT_METHODS.PIX,
            valor: valorTotal,
            status: PAYMENT_STATUS.PENDENTE
        }, {
            ...qrCodeData,
            chave_pix: configPagamento.config.chave_pix,
            nome_titular: configPagamento.config.nome_titular,
            tipo_chave_pix: configPagamento.config.tipo_chave_pix,
            banco: configPagamento.config.banco,
            tipo_conta: configPagamento.config.tipo_conta,
            agencia: configPagamento.config.agencia,
            conta: configPagamento.config.conta,
            expira_em: new Date(Date.now() + (30 * 60 * 1000)) // Expira em 30 minutos
        }, client);

        // Atualiza o status da reserva para aguardando pagamento
        await reservaModel.atualizarStatus(reserva.id, 'pendente_pagamento', client);

        // Envia notificação para o usuário
        await notificationService.enviarNotificacao(
            reserva.usuario_id,
            {
                tipo: 'pagamento_pendente',
                titulo: 'Pagamento Pendente',
                mensagem: `Aguardando confirmação do pagamento de ${formatCurrency(valorTotal)} para o estacionamento ${estacionamento.nome}`,
                dados: {
                    reserva_id: reserva.id,
                    pagamento_id: pagamentoId,
                    valor: valorTotal,
                    metodo_pagamento: PAYMENT_METHODS.PIX,
                    qr_code: qrCodeData.qr_code,
                    qr_code_text: qrCodeData.qr_code_text,
                    chave_pix: qrCodeData.chave_pix,
                    nome_titular: qrCodeData.nome_titular,
                    expira_em: new Date(Date.now() + (30 * 60 * 1000)).toISOString()
                }
            }
        );

        return {
            status: PAYMENT_STATUS.PENDENTE,
            metodo_pagamento: PAYMENT_METHODS.PIX,
            pagamento_id: pagamentoId,
            qr_code: qrCodeData.qr_code,
            qr_code_text: qrCodeData.qr_code_text,
            chave_pix: qrCodeData.chave_pix,
            nome_titular: qrCodeData.nome_titular,
            valor: valorTotal,
            expira_em: new Date(Date.now() + (30 * 60 * 1000)).toISOString(),
            mensagem: 'Aguardando confirmação do pagamento PIX'
        };
    }

    /**
     * Processa um pagamento via cartão de crédito/débito
     * @private
     */
    async processarPagamentoCartao(reserva, estacionamento, valorTotal, metodoPagamento, dadosPagamento, client) {
        // Valida os dados do cartão
        this.validarDadosCartao(dadosPagamento);

        try {
            // Aqui você integraria com um gateway de pagamento real (ex: ASAAS, Pagar.me, etc)
            // Este é um exemplo simplificado
            const transacaoId = `CARD_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

            // Cria o registro de pagamento
            const pagamentoId = await pagamentoModel.criarPagamento({
                reserva_id: reserva.id,
                metodo: metodoPagamento,
                valor: valorTotal,
                status: PAYMENT_STATUS.APROVADO, // Em produção, seria PENDENTE até confirmação do gateway
                dados_adicionais: {
                    transacao_id: transacaoId,
                    ultimos_quatro: dadosPagamento.numero_cartao.slice(-4),
                    bandeira: this.identificarBandeira(dadosPagamento.numero_cartao),
                    parcelas: dadosPagamento.parcelas || 1,
                    valor_parcela: valorTotal / (dadosPagamento.parcelas || 1)
                }
            }, client);

            // Atualiza o status da reserva para confirmada
            await reservaModel.atualizarStatus(reserva.id, 'confirmada', client);

            // Envia notificação para o usuário
            await notificationService.enviarNotificacao(
                reserva.usuario_id,
                {
                    tipo: 'pagamento_aprovado',
                    titulo: 'Pagamento Aprovado',
                    mensagem: `Seu pagamento de ${formatCurrency(valorTotal)} para o estacionamento ${estacionamento.nome} foi aprovado!`,
                    dados: {
                        reserva_id: reserva.id,
                        pagamento_id: pagamentoId,
                        valor: valorTotal,
                        metodo_pagamento: metodoPagamento,
                        transacao_id: transacaoId
                    }
                }
            );

            return {
                status: PAYMENT_STATUS.APROVADO,
                metodo_pagamento: metodoPagamento,
                pagamento_id: pagamentoId,
                transacao_id: transacaoId,
                valor: valorTotal,
                mensagem: 'Pagamento aprovado com sucesso!'
            };

        } catch (error) {
            // Em caso de erro, registra a falha
            await pagamentoModel.criarPagamento({
                reserva_id: reserva.id,
                metodo: metodoPagamento,
                valor: valorTotal,
                status: PAYMENT_STATUS.RECUSADO,
                dados_adicionais: {
                    erro: error.message,
                    codigo_erro: error.code,
                    dados_pagamento: this.ocultarDadosSensiveis(dadosPagamento)
                }
            }, client);

            throw new AppError(`Falha ao processar pagamento: ${error.message}`, 400);
        }
    }

    /**
     * Processa um pagamento em dinheiro
     * @private
     */
    async processarPagamentoDinheiro(reserva, estacionamento, valorTotal, dadosPagamento, client) {
        // Cria o registro de pagamento pendente
        const pagamentoId = await pagamentoModel.criarPagamento({
            reserva_id: reserva.id,
            metodo: PAYMENT_METHODS.DINHEIRO,
            valor: valorTotal,
            status: PAYMENT_STATUS.PENDENTE,
            dados_adicionais: {
                tipo: 'dinheiro',
                valor_troco: dadosPagamento.valor_entregue ? (dadosPagamento.valor_entregue - valorTotal) : null,
                valor_entregue: dadosPagamento.valor_entregue || valorTotal,
                observacao: dadosPagamento.observacao
            }
        }, client);

        // Atualiza o status da reserva para confirmada (ou outro status apropriado)
        await reservaModel.atualizarStatus(reserva.id, 'confirmada', client);

        // Envia notificação para o usuário
        await notificationService.enviarNotificacao(
            reserva.usuario_id,
            {
                tipo: 'pagamento_dinheiro',
                titulo: 'Pagamento em Dinheiro',
                mensagem: `Seu pagamento de ${formatCurrency(valorTotal)} para o estacionamento ${estacionamento.nome} será realizado no local.`,
                dados: {
                    reserva_id: reserva.id,
                    pagamento_id: pagamentoId,
                    valor: valorTotal,
                    metodo_pagamento: PAYMENT_METHODS.DINHEIRO,
                    valor_entregue: dadosPagamento.valor_entregue || valorTotal,
                    troco: dadosPagamento.valor_entregue ? (dadosPagamento.valor_entregue - valorTotal) : 0
                }
            }
        );

        // Envia notificação para o estacionamento (se aplicável)
        if (estacionamento.usuario_id) {
            await notificationService.enviarNotificacao(
                estacionamento.usuario_id,
                {
                    tipo: 'pagamento_dinheiro_estacionamento',
                    titulo: 'Pagamento em Dinheiro - Nova Reserva',
                    mensagem: `Nova reserva #${reserva.id} com pagamento em dinheiro no valor de ${formatCurrency(valorTotal)}.`,
                    dados: {
                        reserva_id: reserva.id,
                        pagamento_id: pagamentoId,
                        valor: valorTotal,
                        cliente: dadosPagamento.nome_cliente || 'Cliente não identificado',
                        telefone: dadosPagamento.telefone_cliente || 'Não informado',
                        placa_veiculo: reserva.placa_veiculo || 'Não informada',
                        horario_entrada: reserva.horario_inicio_reserva,
                        horario_saida: reserva.horario_fim_reserva
                    }
                }
            );
        }

        return {
            status: PAYMENT_STATUS.PENDENTE,
            metodo_pagamento: PAYMENT_METHODS.DINHEIRO,
            pagamento_id: pagamentoId,
            valor: valorTotal,
            mensagem: 'Pagamento em dinheiro registrado com sucesso. Apresente o comprovante no local.'
        };
    }

    /**
     * Gera dados de QR Code PIX via ASAAS (não mais manual)
     * @private
     * @deprecated Usar ASAAS para gerar PIX automaticamente
     */
    async gerarQrCodePix({ chavePix: _chavePix, nomeTitular: _nomeTitular, valor: _valor, descricao: _descricao, cidade: _cidade, txid: _txid }) {
        // Função deprecada - usar ASAAS para pagamentos
        throw new AppError('PIX manual não é mais suportado. Use ASAAS para pagamentos automáticos.', 400);
    }

    /**
     * Valida os dados do cartão de crédito
     * @private
     */
    validarDadosCartao(dados) {
        if (!dados.numero_cartao || !/^\d{13,19}$/.test(dados.numero_cartao.replace(/\s+/g, ''))) {
            throw new AppError('Número do cartão inválido', 400);
        }

        if (!dados.nome_titular || dados.nome_titular.trim().length < 3) {
            throw new AppError('Nome do titular do cartão é obrigatório', 400);
        }

        if (!dados.validade || !/^(0[1-9]|1[0-2])\/([0-9]{2})$/.test(dados.validade)) {
            throw new AppError('Data de validade inválida. Use o formato MM/AA', 400);
        }

        if (!dados.cvv || !/^\d{3,4}$/.test(dados.cvv)) {
            throw new AppError('CVV inválido', 400);
        }

        // Verifica se a data de validade não está expirada
        const [mes, ano] = dados.validade.split('/').map(Number);
        const dataAtual = new Date();
        const anoAtual = dataAtual.getFullYear() % 100;
        const mesAtual = dataAtual.getMonth() + 1; // Janeiro é 0

        if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
            throw new AppError('Cartão com data de validade expirada', 400);
        }
    }

    /**
     * Identifica a bandeira do cartão pelo número
     * @private
     */
    identificarBandeira(numeroCartao) {
        const num = numeroCartao.replace(/\D/g, '');

        // Expressões regulares para identificar as bandeiras mais comuns
        if (/^4/.test(num)) return 'visa';
        if (/^5[1-5]/.test(num)) return 'mastercard';
        if (/^3[47]/.test(num)) return 'amex';
        if (/^(6011|65|64[4-9]|622)/.test(num)) return 'discover';
        if (/^3(?:0[0-5]|[68][0-9])/.test(num)) return 'diners';
        if (/^(36|38|30[0-5])/.test(num)) return 'diners';
        if (/^(606282|3841[046]*)/.test(num)) return 'hipercard';
        if (/^(637|638|639)/.test(num)) return 'elo';

        return 'outros';
    }

    /**
     * Oculta dados sensíveis para logs
     * @private
     */
    ocultarDadosSensiveis(dados) {
        if (!dados || typeof dados !== 'object') return dados;

        const ocultar = {
            numero_cartao: (num) => num ? `**** **** **** ${num.slice(-4)}` : undefined,
            cvv: () => '***',
            senha: () => '******',
            token: (t) => t ? `${t.substring(0, 4)}...${t.substring(t.length - 4)}` : undefined,
            chave_pix: (c) => c ? `${c.substring(0, 4)}...${c.substring(c.length - 4)}` : undefined
        };

        return Object.entries(dados).reduce((acc, [chave, valor]) => {
            if (ocultar[chave]) {
                acc[chave] = ocultar[chave](valor);
            } else if (typeof valor === 'object' && valor !== null) {
                acc[chave] = this.ocultarDadosSensiveis(valor);
            } else {
                acc[chave] = valor;
            }
            return acc;
        }, {});
    }
}

module.exports = new EstacionamentoPaymentProcessingService();
