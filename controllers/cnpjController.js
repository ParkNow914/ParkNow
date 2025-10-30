const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Valida um CNPJ na Receita WS
 */
exports.validarCNPJ = async (req, res) => {
    try {
        const { cnpj } = req.params;
        
        // Validação básica do formato
        if (!cnpj || cnpj.length !== 14) {
            return res.status(400).json({ 
                valido: false, 
                mensagem: 'CNPJ inválido. Deve conter 14 dígitos.' 
            });
        }

        // Verifica se é um CNPJ com dígitos repetidos (inválido)
        if (/^(\d)\1+$/.test(cnpj)) {
            return res.status(400).json({ 
                valido: false, 
                mensagem: 'CNPJ inválido.' 
            });
        }

        // Faz a requisição para a API da Receita WS
        const response = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
            timeout: 5000 // Timeout de 5 segundos
        });

        const data = response.data;

        if (data.status === 'ERROR') {
            return res.status(400).json({ 
                valido: false, 
                mensagem: data.message || 'Erro ao validar CNPJ' 
            });
        }

        if (data.situacao !== 'ATIVA') {
            return res.status(400).json({ 
                valido: false, 
                mensagem: 'CNPJ não está ativo na Receita Federal' 
            });
        }

        // Retorna os dados do CNPJ
        res.json({
            valido: true,
            dados: {
                cnpj: data.cnpj,
                nome: data.nome,
                fantasia: data.fantasia,
                situacao: data.situacao,
                tipo: data.tipo,
                porte: data.porte,
                abertura: data.abertura,
                natureza_juridica: data.natureza_juridica,
                logradouro: data.logradouro,
                numero: data.numero,
                complemento: data.complemento,
                cep: data.cep,
                bairro: data.bairro,
                municipio: data.municipio,
                uf: data.uf,
                email: data.email,
                telefone: data.telefone,
                data_situacao: data.data_situacao,
                motivo_situacao: data.motivo_situacao,
                situacao_especial: data.situacao_especial,
                data_situacao_especial: data.data_situacao_especial
            },
            mensagem: 'CNPJ válido e ativo'
        });

    } catch (error) {
        logger.error('Erro ao validar CNPJ:', error);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({ 
                valido: false, 
                mensagem: 'Tempo de espera excedido ao validar o CNPJ. Tente novamente.' 
            });
        }

        res.status(500).json({ 
            valido: false, 
            mensagem: 'Erro ao validar CNPJ. Por favor, tente novamente mais tarde.' 
        });
    }
};
