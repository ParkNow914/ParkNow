const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');

class PixService {
    constructor() {
        // Configurações da API PIX (exemplo com Gerencianet)
        this.baseUrl = config.pix?.baseUrl || 'https://api-pix.gerencianet.com.br';
        this.clientId = config.pix?.clientId;
        this.clientSecret = config.pix?.clientSecret;
        this.certificate = config.pix?.certificate; // Caminho para o certificado .p12
        this.pixKey = config.pix?.pixKey; // Chave PIX da aplicação
        this.accessToken = null;
        this.tokenExpiresAt = null;
    }

    // Autenticação na API PIX
    async authenticate() {
        try {
            const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            const response = await axios.post(
                `${this.baseUrl}/oauth/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${auth}`
                    },
                    httpsAgent: new (require('https').Agent)({
                        pfx: fs.readFileSync(this.certificate),
                        passphrase: ''
                    })
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
            return this.accessToken;
        } catch (error) {
            logger.error('Erro na autenticação PIX:', error);
            throw new Error('Falha na autenticação com o serviço de pagamento');
        }
    }

    // Verifica se o token está válido
    async ensureAuthenticated() {
        if (!this.accessToken || Date.now() >= this.tokenExpiresAt - 60000) {
            await this.authenticate();
        }
        return this.accessToken;
    }

    // Cria uma cobrança PIX
    async createCharge(amount, payerInfo, estacionamento) {
        try {
            await this.ensureAuthenticated();
            
            // Formata o valor para o formato esperado (sem vírgula ou ponto)
            const valorFormatado = Math.round(parseFloat(amount) * 100).toString();
            
            // Gera um ID único para a transação
            const txid = `PARKNOW${Date.now()}`;
            
            // Dados da cobrança
            const cobranca = {
                calendario: {
                    expiracao: 3600 // 1 hora de validade
                },
                devedor: {
                    cpf: payerInfo.cpf,
                    nome: payerInfo.nome
                },
                valor: {
                    original: valorFormatado
                },
                chave: estacionamento.chave_pix, // Chave PIX do estacionamento
                solicitacaoPagador: `Estacionamento ${estacionamento.nome}`
            };

            const response = await axios.post(
                `${this.baseUrl}/v2/cob/${txid}`,
                cobranca,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    httpsAgent: new (require('https').Agent)({
                        pfx: fs.readFileSync(this.certificate),
                        passphrase: ''
                    })
                }
            );

            // Gera o QR Code
            const qrCodeResponse = await axios.get(
                `${this.baseUrl}/v2/loc/${response.data.loc.id}/qrcode`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    httpsAgent: new (require('https').Agent)({
                        pfx: fs.readFileSync(this.certificate),
                        passphrase: ''
                    })
                }
            );

            return {
                qrCode: qrCodeResponse.data.qrcode,
                qrCodeText: qrCodeResponse.data.qrcode,
                txid: txid,
                valor: amount,
                expiracao: response.data.calendario.expiracao,
                status: 'ATIVA',
                chavePix: estacionamento.chave_pix,
                nomeTitular: estacionamento.nome_titular_pix
            };
        } catch (error) {
            logger.error('Erro ao criar cobrança PIX:', error.response?.data || error.message);
            throw new Error('Falha ao gerar cobrança PIX');
        }
    }

    // Verifica o status de uma transação PIX
    async checkPaymentStatus(txid) {
        try {
            await this.ensureAuthenticated();
            
            const response = await axios.get(
                `${this.baseUrl}/v2/cob/${txid}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    httpsAgent: new (require('https').Agent)({
                        pfx: fs.readFileSync(this.certificate),
                        passphrase: ''
                    })
                }
            );

            return {
                status: response.data.status,
                valor: response.data.valor.original / 100, // Converte de centavos para reais
                pagador: response.data.pagador,
                horario: response.data.horario
            };
        } catch (error) {
            logger.error('Erro ao verificar status do PIX:', error.response?.data || error.message);
            throw new Error('Falha ao verificar status do pagamento');
        }
    }
}

module.exports = new PixService();
