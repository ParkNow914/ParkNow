const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Valida um CNPJ na Receita Federal via Brasil API
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

        // Tenta primeiro a Brasil API (mais confiável)
        try {
            const brasilApiResponse = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
                timeout: 8000
            });

            const data = brasilApiResponse.data;

            // Verifica situação cadastral (02 = ATIVA)
            if (data.descricao_situacao_cadastral && !data.descricao_situacao_cadastral.toUpperCase().includes('ATIVA')) {
                return res.status(400).json({ 
                    valido: false, 
                    mensagem: `CNPJ ${data.descricao_situacao_cadastral.toLowerCase()} na Receita Federal` 
                });
            }

            // Retorna os dados do CNPJ (SEM telefone - pode estar desatualizado)
            return res.json({
                valido: true,
                dados: {
                    cnpj: data.cnpj,
                    razao_social: data.razao_social,
                    nome_fantasia: data.nome_fantasia,
                    situacao_cadastral: data.descricao_situacao_cadastral,
                    tipo: data.descricao_tipo_de_logradouro,
                    porte: data.porte,
                    abertura: data.data_inicio_atividade,
                    natureza_juridica: data.natureza_juridica,
                    logradouro: data.logradouro,
                    numero: data.numero,
                    complemento: data.complemento,
                    cep: data.cep,
                    bairro: data.bairro,
                    municipio: data.municipio,
                    uf: data.uf,
                    email: data.email,
                    // telefone: data.ddd_telefone_1, // REMOVIDO - pode estar desatualizado
                    capital_social: data.capital_social
                },
                mensagem: 'CNPJ válido e ativo (Receita Federal)'
            });
        } catch (brasilApiError) {
            // Se Brasil API falhar, tenta ReceitaWS como fallback
            logger.warn('Brasil API falhou, tentando ReceitaWS como fallback');
            
            const receitaResponse = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
                timeout: 5000
            });

            const data = receitaResponse.data;

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

            // Retorna os dados do CNPJ (ReceitaWS - SEM telefone)
            return res.json({
                valido: true,
                dados: {
                    cnpj: data.cnpj,
                    razao_social: data.nome,
                    nome_fantasia: data.fantasia,
                    situacao_cadastral: data.situacao,
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
                    email: data.email
                    // telefone: data.telefone // REMOVIDO - pode estar desatualizado
                },
                mensagem: 'CNPJ válido e ativo'
            });
        }

    } catch (error) {
        logger.error('Erro ao validar CNPJ:', error);
        
        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({ 
                valido: false, 
                mensagem: 'Tempo de espera excedido ao validar o CNPJ. Tente novamente.' 
            });
        }

        if (error.response && error.response.status === 404) {
            return res.status(404).json({ 
                valido: false, 
                mensagem: 'CNPJ não encontrado na Receita Federal' 
            });
        }

        res.status(500).json({ 
            valido: false, 
            mensagem: 'Erro ao validar CNPJ. Por favor, tente novamente mais tarde.' 
        });
    }
};
