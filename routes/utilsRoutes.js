// routes/utilsRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { param, body, validationResult } = require('express-validator');
const cepPromise = require('cep-promise');
const { handleValidationErrors } = require('../middleware/validationMiddleware');

// Importa as funções necessárias do módulo addressParser
const {
    validarCEP,
    analisarEndereco,
    gerarVariacoesEndereco,
    buscarPorCEP
} = require('../utils/addressParser');

require('dotenv').config();

/**
 * @route   GET /api/utils/buscar-cep/:cep
 * @desc    Busca informações de um CEP usando a API ViaCEP (proxy para evitar problemas de CORS/CSP)
 * @access  Public
 */
router.get('/buscar-cep/:cep', [
    param('cep').matches(/^\d{8}$/).withMessage('CEP inválido. Deve conter 8 dígitos numéricos.')
], handleValidationErrors, async (req, res) => {
    const { cep } = req.params;
    
    try {
        // Faz a requisição para a API ViaCEP
        const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
        
        // Verifica se a resposta contém erro
        if (response.data.erro) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'CEP não encontrado.' 
            });
        }
        
        // Retorna os dados do CEP
        return res.json(response.data);
    } catch (error) {
        console.error(`[CEP API] Erro ao buscar CEP ${cep}:`, error.message);
        return res.status(500).json({ 
            status: 'error', 
            message: 'Erro ao consultar o serviço de CEP. Tente novamente mais tarde.' 
        });
    }
});

/**
 * @route   POST /api/utils/geocodificar
 * @desc    Converte endereço em coordenadas usando OpenCage
 * @access  Public
 */
router.post('/geocodificar', [
    body('endereco').isString().trim().notEmpty().withMessage('Endereço é obrigatório')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                status: 'error',
                errors: errors.array() 
            });
        }

        let { endereco } = req.body;
        const API_KEY = process.env.OPENCAGE_API_KEY || 'c1fd271c611f49aa80d0c6e62cfb1aef';
        
        // Se for um array, pega o primeiro endereço para tentativas sequenciais
        const enderecos = Array.isArray(endereco) ? endereco : [endereco];
        
        // Tenta cada formato de endereço até encontrar um resultado com boa confiança
        for (const end of enderecos) {
            try {
                const response = await axios.get(
                    `https://api.opencagedata.com/geocode/v1/json`,
                    {
                        params: {
                            q: end,
                            key: API_KEY,
                            language: 'pt-br',
                            countrycode: 'br',  // Foca no Brasil
                            limit: 1,
                            no_annotations: 1,
                            pretty: 0,
                            no_dedupe: 1,
                            abbrv: 0,
                            addressdetails: 1,
                            bounds: '-73.9872354804,-33.7683777809,-28.6357602777,5.24448639569',
                            roadinfo: 1,  // Mais detalhes sobre a rua
                            'q.parser': 'structured',
                            'q.parser.structured.street_number': end.match(/\d+/) ? end.match(/\d+/)[0] : undefined,
                            // Adiciona parâmetros de precisão
                            'q.parser.structured.street': end.split(',')[0],
                            'q.parser.structured.city': end.match(/([^,]+),\s*[A-Z]{2}/)?.[1]?.trim(),
                            'q.parser.structured.country': 'Brasil',
                            // Prioriza resultados com número de rua
                            'q.parser.structured.housenumber': end.match(/\d+/)?.[0] || undefined
                        },
                        timeout: 10000
                    }
                );
                
                if (response.data.results && response.data.results.length > 0) {
                    const result = response.data.results[0];
                    const { lat, lng } = result.geometry;
                    const confidence = result.confidence || 0;
                    
                    console.log(`Geocodificação para "${end}":`, {
                        confianca: confidence,
                        endereco: result.formatted,
                        componentes: result.components
                    });
                    
                    // Função para formatar coordenada com precisão consistente
                    const formatCoord = (coord) => {
                        // Converte para número e garante que é um número válido
                        const num = parseFloat(coord);
                        if (isNaN(num)) return '0.000000000000000';
                        
                        // Formata com 15 casas decimais (precisão de frações de micrômetro)
                        // Usa o método toFixed para garantir o número exato de casas
                        return num.toFixed(15);
                    };

                    // Valida se as coordenadas estão dentro do Brasil
                    const isInBrazil = (lat, lng) => {
                        // Limites aproximados do Brasil
                        const BRAZIL_BOUNDS = {
                            minLat: -33.75, // Ponto mais ao sul
                            maxLat: 5.27,   // Ponto mais ao norte
                            minLng: -73.99,  // Ponto mais a oeste
                            maxLng: -34.79   // Ponto mais a leste
                        };
                        return (
                            lat >= BRAZIL_BOUNDS.minLat &&
                            lat <= BRAZIL_BOUNDS.maxLat &&
                            lng >= BRAZIL_BOUNDS.minLng &&
                            lng <= BRAZIL_BOUNDS.maxLng
                        );
                    };

                    // Verifica a qualidade do resultado
                    const isGoodResult = (result) => {
                        // Verifica se é um endereço exato (não apenas cidade/estado)
                        const isExactAddress = result.components.road || 
                                             result.components.house_number || 
                                             result.components.house;
                        
                        // Verifica se o tipo de resultado é adequado
                        const goodTypes = ['house', 'building', 'residential', 'commercial'];
                        const hasGoodType = result.components._type && 
                                          goodTypes.some(type => result.components._type.includes(type));
                        
                        return isExactAddress || hasGoodType;
                    };

                    // Verifica se o resultado é válido
                    const isValidResult = isInBrazil(lat, lng) && 
                                        (confidence >= 0.7 || isGoodResult(result));
                    
                    // Prepara os dados de resposta
                    const responseData = {
                        latitude: formatCoord(lat),
                        longitude: formatCoord(lng),
                        confidence: confidence,
                        formatted: result.formatted,
                        address_components: result.components,
                        raw_coordinates: { lat, lng },
                        debug: {
                            isInBrazil: isInBrazil(lat, lng),
                            isGoodResult: isGoodResult(result),
                            addressTried: end,
                            resultType: result.components._type,
                            components: result.components
                        }
                    };

                    // Se for um bom resultado, retorna imediatamente
                    if (isValidResult) {
                        console.log('Resultado válido encontrado:', {
                            address: end,
                            confidence,
                            type: result.components._type,
                            formatted: result.formatted
                        });
                        return res.json({
                            status: 'success',
                            data: responseData
                        });
                    }
                    
                    // Se for o último endereço, retorna o melhor que tiver
                    if (end === enderecos[enderecos.length - 1]) {
                        console.warn('Retornando melhor resultado disponível (baixa confiança):', {
                            address: end,
                            confidence,
                            type: result.components._type,
                            formatted: result.formatted,
                            isInBrazil: isInBrazil(lat, lng),
                            isGoodResult: isGoodResult(result)
                        });
                        
                        responseData.warning = 'Baixa confiança no resultado';
                        return res.json({
                            status: 'success',
                            data: responseData
                        });
                    }
                }
            } catch (error) {
                console.error(`Erro ao geocodificar "${end}":`, error.message);
                // Se for o último endereço e deu erro, retorna o erro
                if (end === enderecos[enderecos.length - 1]) {
                    throw error;
                }
                // Senão, tenta o próximo formato
                continue;
            }
        }
        
        // Se chegou aqui, não encontrou nenhum resultado
        return res.status(404).json({
            status: 'error',
            message: 'Nenhum resultado encontrado para os endereços fornecidos.'
        });
        
    } catch (error) {
        console.error('[Geocoding Error]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Erro ao geocodificar endereço',
            details: error.message
        });
    }
});

/**
 * Rota para análise e processamento de endereços
 * Gera variações de endereço para melhorar a precisão da geocodificação
 */
router.post('/parse-address', [
    body('logradouro').optional().trim(),
    body('numero').optional().trim(),
    body('bairro').optional().trim(),
    body('cidade').optional().trim(),
    body('uf').optional().trim().isLength({ min: 2, max: 2 }),
    body('cep').optional().trim()
], async (req, res) => {
    console.log('Requisição recebida em /parse-address');
    console.log('Corpo da requisição:', JSON.stringify(req.body, null, 2));
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Dados de entrada inválidos',
                errors: errors.array() 
            });
        }

        const { logradouro, numero, bairro, cidade, uf, cep } = req.body;
        let enderecoDados = { logradouro, numero, bairro, cidade, uf, cep };

        // Se tivermos CEP, tenta primeiro buscar os dados completos
        if (cep && validarCEP(cep)) {
            try {
                const cepData = await cepPromise(cep);
                // Atualiza os campos com os dados do CEP, mantendo os valores já preenchidos
                enderecoDados = {
                    ...enderecoDados,
                    logradouro: enderecoDados.logradouro || cepData.street || '',
                    bairro: enderecoDados.bairro || cepData.neighborhood || '',
                    cidade: enderecoDados.cidade || cepData.city || '',
                    uf: enderecoDados.uf || cepData.state || ''
                };
            } catch (error) {
                console.warn('Não foi possível buscar dados do CEP:', error.message);
            }
        }

        // Analisa o endereço para extrair componentes
        const enderecoAnalisado = analisarEndereco(
            `${enderecoDados.logradouro || ''}, ${enderecoDados.numero || ''}, ${enderecoDados.bairro || ''}, ${enderecoDados.cidade || ''} - ${enderecoDados.uf || ''}`
        );
        
        // Combina os dados do formulário com a análise
        const enderecoCompleto = {
            ...enderecoAnalisado,
            // Mantém os dados do formulário quando disponíveis
            logradouro: enderecoDados.logradouro || enderecoAnalisado.logradouro || '',
            numero: enderecoDados.numero || enderecoAnalisado.numero || '',
            bairro: enderecoDados.bairro || enderecoAnalisado.bairro || '',
            cidade: enderecoDados.cidade || enderecoAnalisado.cidade || '',
            uf: enderecoDados.uf || enderecoAnalisado.uf || '',
            cep: enderecoDados.cep || enderecoAnalisado.cep || ''
        };
        
        // Gera múltiplas variações para tentar na geocodificação
        const variacoes = gerarVariacoesEndereco(enderecoCompleto);
        
        // Remove variações duplicadas
        const variacoesUnicas = [...new Set(variacoes)];
        
        // Retorna as variações geradas
        return res.json({
            status: 'success',
            data: {
                endereco: enderecoCompleto,
                variacoes: variacoesUnicas
            }
        });
        
    } catch (error) {
        console.error('Erro ao processar endereço:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Erro ao processar endereço',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
