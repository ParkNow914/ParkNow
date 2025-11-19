/**
 * Asaas Marketplace Service
 * Gerencia pagamentos com split automático entre ParkNow e Estacionamentos
 * 
 * Documentação: https://docs.asaas.com/reference/marketplace
 * Vantagens: 
 * - Sandbox funciona perfeitamente
 * - API simples e clara
 * - Split de pagamentos nativo
 * - PIX instantâneo
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

class AsaasMarketplaceService {
    constructor() {
        this.apiKey = process.env.ASAAS_SANDBOX === 'true' 
            ? process.env.ASAAS_SANDBOX_API_KEY 
            : process.env.ASAAS_API_KEY;

        this.baseURL = process.env.ASAAS_SANDBOX === 'true'
            ? 'https://sandbox.asaas.com/api/v3'
            : 'https://api.asaas.com/v3';

        this.platformFeePercent = parseFloat(process.env.ASAAS_PLATFORM_FEE_PERCENT || '15.0');

        logger.debug('ASAAS API Key (primeiros 20 chars):', this.apiKey?.substring(0, 20));

        if (!this.apiKey) {
            throw new Error('ASAAS_API_KEY não configurado!');
        }

        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'access_token': this.apiKey,
                'Content-Type': 'application/json',
                'User-Agent': 'ParkNow/1.0'
            },
            timeout: 30000
        });

        logger.info('Asaas Marketplace Service inicializado:', {
            ambiente: process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO',
            baseURL: this.baseURL,
            platformFee: `${this.platformFeePercent}%`,
            apiKeyInicioCom: this.apiKey?.substring(0, 10) + '...',
            isSandbox: process.env.ASAAS_SANDBOX === 'true'
        });

        // Verificar status da conta no sandbox
        if (process.env.ASAAS_SANDBOX === 'true') {
            this.verificarContaSandbox();
        }
    }

    /**
     * Verifica o status da conta no sandbox
     */
    async verificarContaSandbox() {
        try {
            const response = await this.client.get('/myAccount');
            const account = response.data;
            
            logger.info('Status da conta Asaas Sandbox:', {
                walletId: account.walletId,
                name: account.name,
                email: account.email,
                personType: account.personType
            });
            
            // Verificar se PIX está habilitado
            if (account.pixEnabled === false) {
                logger.warn('⚠️ PIX NÃO ESTÁ HABILITADO na conta Asaas Sandbox!');
                logger.warn('Para habilitar: Acesse o painel Asaas > Configurações > Formas de recebimento > PIX');
            }
        } catch (error) {
            logger.error('Erro ao verificar conta Asaas:', {
                error: error.message,
                response: error.response?.data
            });
        }
    }

    /**
     * Criar ou buscar cliente no Asaas
     */
    async obterOuCriarCliente(dadosCliente) {
        const { email, nome, cpf, telefone } = dadosCliente;

        try {
            // Primeiro, tentar buscar cliente pelo email
            logger.info('Buscando cliente Asaas por email:', email);
            
            try {
                const searchResponse = await this.client.get('/customers', {
                    params: { email }
                });

                if (searchResponse.data.data && searchResponse.data.data.length > 0) {
                    const cliente = searchResponse.data.data[0];
                    
                    // SEMPRE atualizar se faltar telefone OU endereço (obrigatórios para checkout)
                    const precisaAtualizar = !cliente.phone || !cliente.mobilePhone || !cliente.address;
                    
                    if (precisaAtualizar) {
                        const telefoneParaUsar = telefone || cliente.phone || '1140041234';
                        
                        logger.info('⚠️ Cliente precisa de atualização:', {
                            id: cliente.id,
                            tem_telefone: !!cliente.phone,
                            tem_endereco: !!cliente.address
                        });
                        
                        try {
                            await this.client.put(`/customers/${cliente.id}`, {
                                phone: telefoneParaUsar,
                                mobilePhone: cliente.mobilePhone || telefoneParaUsar,
                                // Garantir endereço completo
                                address: cliente.address || 'Av. Paulista',
                                addressNumber: cliente.addressNumber || '1000',
                                province: cliente.province || 'Bela Vista',
                                postalCode: cliente.postalCode || '01310100'
                            });
                            
                            logger.info('✅ Cliente atualizado com sucesso');
                        } catch (updateError) {
                            logger.error('❌ Erro ao atualizar cliente:', {
                                error: updateError.message,
                                response: updateError.response?.data
                            });
                            // Não falhar, apenas logar
                            logger.warn('⚠️ Continuando com cliente sem atualização');
                        }
                    }
                    
                    logger.info('Cliente Asaas encontrado/atualizado:', {
                        id: cliente.id,
                        email: cliente.email,
                        phone: cliente.phone,
                        address: cliente.address
                    });
                    return cliente.id;
                }
            } catch (searchError) {
                logger.warn('Erro ao buscar cliente (prosseguindo para criar):', searchError.message);
            }

            // Se não encontrou, criar novo cliente
            logger.info('Criando novo cliente Asaas:', { email, nome, telefone });
            
            const customerPayload = {
                name: nome,
                email: email,
                cpfCnpj: cpf || undefined,
                phone: telefone || '1140041234', // Telefone válido (11) 4004-1234
                mobilePhone: telefone || '11987654321', // Celular válido
                // Endereço padrão (obrigatório para checkout)
                address: 'Av. Paulista',
                addressNumber: '1000',
                province: 'Bela Vista',
                postalCode: '01310100'
            };

            const createResponse = await this.client.post('/customers', customerPayload);
            const novoCliente = createResponse.data;

            logger.info('Cliente Asaas criado:', {
                id: novoCliente.id,
                email: novoCliente.email
            });

            return novoCliente.id;

        } catch (error) {
            logger.error('Erro ao obter/criar cliente Asaas:', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * Criar pagamento PIX com split automático
     */
    async criarPagamentoPixComSplit(paymentData) {
        const {
            valor,
            descricao,
            email_pagador,
            nome_pagador,
            cpf_pagador,
            estacionamento_id,
            estacionamento_asaas_account_id,
            reserva_id
        } = paymentData;

        try {
            // Log dos dados recebidos
            logger.info('Criando pagamento PIX no Asaas:', {
                valor,
                email_pagador,
                nome_pagador,
                estacionamento_id,
                estacionamento_asaas_account: estacionamento_asaas_account_id,
                reserva_id
            });

            // Validações
            if (!email_pagador) {
                throw new AppError('Email do pagador é obrigatório', 400);
            }

            if (!nome_pagador) {
                throw new AppError('Nome do pagador é obrigatório', 400);
            }

            if (valor <= 0) {
                throw new AppError('Valor do pagamento deve ser maior que zero', 400);
            }

            // Obter ou criar cliente no Asaas
            const customerId = await this.obterOuCriarCliente({
                email: email_pagador,
                nome: nome_pagador,
                cpf: cpf_pagador
            });

            logger.info('Customer ID obtido:', customerId);

            // Calcular split (15% plataforma, 85% estacionamento)
            const comissaoPlataforma = parseFloat((valor * (this.platformFeePercent / 100)).toFixed(2));
            const valorEstacionamento = parseFloat((valor - comissaoPlataforma).toFixed(2));

            logger.info('Split calculado:', {
                valor_total: valor,
                comissao_plataforma: comissaoPlataforma,
                percentual: `${this.platformFeePercent}%`,
                valor_estacionamento: valorEstacionamento,
                percentual_estacionamento: `${100 - this.platformFeePercent}%`
            });

            // Criar cobrança no Asaas
            const cobrancaPayload = {
                customer: customerId, // ID do cliente Asaas
                billingType: 'PIX',
                value: valor,
                dueDate: new Date().toISOString().split('T')[0], // Hoje
                description: descricao || `Reserva #${reserva_id} - ParkNow`,
                externalReference: `reserva_${reserva_id}`,
                
                // Split de pagamento
                split: estacionamento_asaas_account_id ? [
                    {
                        walletId: estacionamento_asaas_account_id, // ID da conta do estacionamento
                        fixedValue: valorEstacionamento, // 85% vai para o estacionamento
                        percentualValue: null
                    }
                ] : undefined
            };

            logger.info('Payload Asaas:', JSON.stringify(cobrancaPayload, null, 2));

            // Criar cobrança
            const response = await this.client.post('/payments', cobrancaPayload);
            const payment = response.data;

            logger.info('Cobrança Asaas criada:', {
                payment_id: payment.id,
                status: payment.status,
                split_configurado: !!cobrancaPayload.split,
                wallet_destino: estacionamento_asaas_account_id
            });

            // Log detalhado do split
            if (cobrancaPayload.split) {
                logger.info('✅ SPLIT DE PAGAMENTO CONFIGURADO:', {
                    plataforma_recebe: comissaoPlataforma,
                    estacionamento_recebe: valorEstacionamento,
                    wallet_estacionamento: estacionamento_asaas_account_id,
                    percentual_plataforma: `${this.platformFeePercent}%`,
                    percentual_estacionamento: `${100 - this.platformFeePercent}%`
                });
            } else {
                logger.warn('⚠️ PAGAMENTO SEM SPLIT - Todo valor vai para a conta principal');
            }

            // Gerar QR Code PIX
            const pixResponse = await this.client.get(`/payments/${payment.id}/pixQrCode`);
            const pixData = pixResponse.data;

            if (!pixData.encodedImage || !pixData.payload) {
                throw new AppError('Erro ao gerar QR Code PIX', 500);
            }

            logger.info('QR Code PIX gerado com sucesso:', {
                payment_id: payment.id,
                qr_code_presente: !!pixData.payload
            });

            // Retornar dados do pagamento
            return {
                payment_id: payment.id,
                status: payment.status,
                status_detail: payment.status,
                
                // Dados PIX
                qr_code: pixData.payload,
                qr_code_base64: pixData.encodedImage,
                
                // Dados do split
                valor_total: valor,
                comissao_plataforma: comissaoPlataforma,
                valor_estacionamento: valorEstacionamento,
                percentual_split: this.platformFeePercent,
                
                // Metadados
                external_reference: `reserva_${reserva_id}`,
                date_of_expiration: payment.dueDate
            };

        } catch (error) {
            logger.error('Erro ao criar pagamento PIX no Asaas:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status,
                ambiente: process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'
            });

            if (error.response?.data) {
                const asaasError = error.response.data;
                const errorMsg = asaasError.errors?.[0]?.description || asaasError.message || 'Erro desconhecido';
                
                // Se o erro for sobre PIX não disponível no sandbox
                if (errorMsg.includes('Pix não está disponível') || errorMsg.includes('conta precisa estar aprovada')) {
                    throw new AppError(
                        `❌ Erro Asaas Sandbox: ${errorMsg}\n\n` +
                        `🔧 Possíveis soluções:\n` +
                        `1. Verificar se a API Key do sandbox está correta\n` +
                        `2. Acessar o painel Asaas e aprovar a conta sandbox\n` +
                        `3. Gerar uma nova API Key no sandbox\n` +
                        `4. Contatar o suporte do Asaas\n\n` +
                        `📝 Ambiente: ${process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'}`,
                        error.response.status || 500
                    );
                }
                
                throw new AppError(
                    `Erro Asaas: ${errorMsg}`,
                    error.response.status || 500
                );
            }

            throw new AppError('Erro ao processar pagamento. Tente novamente.', 500);
        }
    }

    /**
     * Consultar status de um pagamento
     */
    async consultarPagamento(payment_id) {
        try {
            const response = await this.client.get(`/payments/${payment_id}`);
            return response.data;
        } catch (error) {
            logger.error('Erro ao consultar pagamento Asaas:', {
                payment_id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Processar webhook do Asaas
     */
    async processarNotificacao(notification) {
        try {
            const { event, payment } = notification;

            logger.info('Webhook Asaas recebido:', {
                event,
                payment_id: payment?.id,
                status: payment?.status
            });

            // Buscar dados completos do pagamento
            const paymentData = await this.consultarPagamento(payment.id);

            logger.info('Pagamento Asaas atualizado:', {
                payment_id: paymentData.id,
                status: paymentData.status,
                external_reference: paymentData.externalReference
            });

            return {
                processed: true,
                payment: paymentData
            };

        } catch (error) {
            logger.error('Erro ao processar notificação Asaas:', {
                error: error.message,
                notification
            });
            throw error;
        }
    }

    /**
     * Cancelar pagamento (somente se ainda estiver pendente)
     */
    async cancelarPagamento(payment_id) {
        try {
            logger.info('Cancelando pagamento no Asaas:', { payment_id });
            
            const response = await this.client.delete(`/payments/${payment_id}`);
            
            logger.info('✅ Pagamento cancelado no Asaas:', {
                payment_id,
                deleted: response.data.deleted
            });

            return {
                success: true,
                payment_id,
                message: 'Pagamento cancelado com sucesso'
            };
        } catch (error) {
            logger.error('Erro ao cancelar pagamento Asaas:', {
                payment_id,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * Estornar pagamento (quando já foi confirmado/pago)
     */
    async estornarPagamento(payment_id) {
        try {
            logger.info('Solicitando estorno no Asaas:', { payment_id });
            
            const response = await this.client.post(`/payments/${payment_id}/refund`);
            
            logger.info('✅ Estorno solicitado no Asaas:', {
                payment_id,
                refund_id: response.data.id,
                status: response.data.status
            });

            return {
                success: true,
                payment_id,
                refund_id: response.data.id,
                status: response.data.status,
                message: 'Estorno processado com sucesso'
            };
        } catch (error) {
            logger.error('Erro ao estornar pagamento Asaas:', {
                payment_id,
                error: error.message,
                response: error.response?.data
            });
            
            // Se o erro for que o pagamento não pode ser estornado
            if (error.response?.status === 400) {
                throw new AppError(
                    'Este pagamento não pode ser estornado. ' + 
                    (error.response.data?.errors?.[0]?.description || 'Verifique o status do pagamento.'),
                    400
                );
            }
            
            throw error;
        }
    }

    /**
     * Criar Checkout Asaas (interface pronta e profissional)
     * Retorna URL para redirecionar o cliente
     * TEMPORÁRIO: Funciona sem split até configurar marketplace
     */
    async criarCheckout(checkoutData) {
        const {
            valor,
            descricao,
            email_pagador,
            nome_pagador,
            cpf_pagador,
            estacionamento_id,
            estacionamento_asaas_account_id, // Pode ser null/undefined
            reserva_id,
            success_url,
            cancel_url
        } = checkoutData;

        try {
            logger.info('Criando Checkout Asaas:', {
                valor,
                email_pagador,
                nome_pagador,
                reserva_id,
                tem_wallet_id: !!estacionamento_asaas_account_id,
                wallet_id_valor: estacionamento_asaas_account_id,
                wallet_id_tipo: typeof estacionamento_asaas_account_id
            });

            // Obter ou criar cliente no Asaas
            const customerId = await this.obterOuCriarCliente({
                email: email_pagador,
                nome: nome_pagador,
                cpf: cpf_pagador,
                telefone: checkoutData.telefone_pagador || '1140041234' // Telefone válido
            });

            // DEBUG: Log detalhado do wallet_id
            logger.info('🔍 DEBUG - Verificando wallet_id:', {
                estacionamento_asaas_account_id,
                tipo: typeof estacionamento_asaas_account_id,
                length: estacionamento_asaas_account_id ? estacionamento_asaas_account_id.length : 'N/A',
                isNull: estacionamento_asaas_account_id === null,
                isUndefined: estacionamento_asaas_account_id === undefined,
                isEmptyString: estacionamento_asaas_account_id === '',
                truthy: !!estacionamento_asaas_account_id
            });

            // Calcular split APENAS se tiver wallet_id do estacionamento
            let comissaoPlataforma = 0;
            let valorEstacionamento = valor;
            let splitConfigurado = false;

            if (estacionamento_asaas_account_id) {
                comissaoPlataforma = parseFloat((valor * (this.platformFeePercent / 100)).toFixed(2));
                valorEstacionamento = parseFloat((valor - comissaoPlataforma).toFixed(2));
                splitConfigurado = true;

                logger.info('Split calculado:', {
                    valor_total: valor,
                    comissao_plataforma: comissaoPlataforma,
                    valor_estacionamento: valorEstacionamento
                });
            } else {
                logger.warn('⚠️ Checkout sem split - todo valor vai para conta principal');
                logger.warn('TODO: Configurar marketplace ASAAS para split automático');
            }

            // Criar checkout
            const checkoutPayload = {
                customer: customerId,
                billingTypes: ['PIX'], // APENAS PIX - removido cartão de crédito
                chargeTypes: ['DETACHED'], // Cobrança avulsa (não recorrente)
                
                // Itens do checkout (obrigatório)
                items: [
                    {
                        name: `Reserva #${reserva_id}`, // Máximo 30 caracteres
                        value: valor,
                        quantity: 1,
                        description: descricao || `Reserva de vaga de estacionamento`
                    }
                ],
                
                // Split de pagamento APENAS se tiver wallet_id
                split: splitConfigurado ? [
                    {
                        walletId: estacionamento_asaas_account_id,
                        fixedValue: valorEstacionamento,
                        percentualValue: null
                    }
                ] : undefined,

                // Callback de notificação (webhook)
                callback: {
                    successUrl: success_url,
                    cancelUrl: cancel_url,
                    autoRedirect: true
                },

                // Configurações do checkout (cartão de crédito) - REMOVIDO pois só PIX
                // maxInstallmentCount: 1, // Apenas à vista
                
                // Metadados
                externalReference: `reserva_${reserva_id}`
            };

            logger.info('Payload Checkout Asaas:', JSON.stringify(checkoutPayload, null, 2));

            const response = await this.client.post('/checkouts', checkoutPayload);
            const checkout = response.data;

            logger.info('✅ Checkout Asaas criado:', {
                checkout_id: checkout.id,
                split_configurado: splitConfigurado
            });

            // Construir URL do checkout
            const checkoutUrl = process.env.ASAAS_SANDBOX === 'true'
                ? `https://sandbox.asaas.com/checkoutSession/show?id=${checkout.id}`
                : `https://asaas.com/checkoutSession/show?id=${checkout.id}`;

            logger.info('🔗 URL do Checkout:', checkoutUrl);

            return {
                checkout_id: checkout.id,
                checkout_url: checkoutUrl,
                payment_id: checkout.payment?.id, // ID do pagamento (quando houver)
                status: checkout.status,
                
                // Dados do split (ou zeros se não configurado)
                valor_total: valor,
                comissao_plataforma: comissaoPlataforma,
                valor_estacionamento: valorEstacionamento,
                percentual_split: splitConfigurado ? this.platformFeePercent : 0,
                
                // Metadados
                external_reference: `reserva_${reserva_id}`
            };

        } catch (error) {
            logger.error('Erro ao criar Checkout Asaas:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            if (error.response?.data) {
                const asaasError = error.response.data;
                const errorMsg = asaasError.errors?.[0]?.description || asaasError.message || 'Erro desconhecido';
                
                throw new AppError(
                    `Erro Asaas Checkout: ${errorMsg}`,
                    error.response.status || 500
                );
            }

            throw new AppError('Erro ao criar checkout de pagamento. Tente novamente.', 500);
        }
    }

    /**
     * Criar subconta para estacionamento
     * Se o email já existe, retorna a subconta existente
     */
    async criarSubconta(dadosEstacionamento) {
        try {
            const { nome, email, cpfCnpj, telefone, incomeValue, address, addressNumber, province, postalCode } = dadosEstacionamento;

            // Primeiro, tentar buscar subconta existente pelo email
            try {
                logger.info('Buscando subconta ASAAS existente por email:', email);
                
                const searchResponse = await this.client.get('/accounts', {
                    params: { email }
                });

                if (searchResponse.data.data && searchResponse.data.data.length > 0) {
                    const subconta = searchResponse.data.data[0];
                    
                    logger.info('✅ Subconta ASAAS já existe:', {
                        walletId: subconta.walletId,
                        email: subconta.email,
                        name: subconta.name
                    });
                    
                    return subconta;
                }
            } catch (searchError) {
                logger.warn('Erro ao buscar subconta (prosseguindo para criar):', searchError.message);
            }

            // Se não encontrou, criar nova subconta
            logger.info('Criando nova subconta ASAAS:', { nome, email, cpfCnpj, incomeValue });

            const response = await this.client.post('/accounts', {
                name: nome,
                email: email,
                cpfCnpj: cpfCnpj,
                mobilePhone: telefone,
                incomeValue: incomeValue, // Campo obrigatório: renda/faturamento mensal
                companyType: cpfCnpj.length === 14 ? 'MEI' : 'LIMITED',
                site: 'https://parknow.com.br',
                
                // Campos de endereço obrigatórios
                address: address,
                addressNumber: addressNumber,
                province: province,
                postalCode: postalCode
            });

            logger.info('✅ Subconta Asaas criada:', {
                walletId: response.data.walletId,
                email
            });

            return response.data;
        } catch (error) {
            logger.error('Erro ao criar subconta Asaas:', {
                error: error.message,
                response: error.response?.data
            });
            
            // Se o erro for que o email já existe, tentar buscar novamente
            if (error.response?.status === 400 && 
                error.response?.data?.errors?.[0]?.description?.includes('já está em uso')) {
                
                logger.warn('Email já em uso. Tentando buscar subconta existente...');
                
                try {
                    const searchResponse = await this.client.get('/accounts', {
                        params: { email: dadosEstacionamento.email }
                    });

                    if (searchResponse.data.data && searchResponse.data.data.length > 0) {
                        const subconta = searchResponse.data.data[0];
                        
                        logger.info('✅ Subconta encontrada após erro de duplicação:', {
                            walletId: subconta.walletId,
                            email: subconta.email
                        });
                        
                        return subconta;
                    }
                } catch (searchError) {
                    logger.error('Erro ao buscar subconta após duplicação:', searchError.message);
                }
            }
            
            throw error;
        }
    }
}

module.exports = new AsaasMarketplaceService();
