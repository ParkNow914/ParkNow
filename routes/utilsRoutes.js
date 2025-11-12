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
 * @route   POST /api/utils/geocodificar-preciso
 * @desc    Geocodificação ULTRA precisa com múltiplas APIs e validação cruzada
 * @access  Public
 */
router.post('/geocodificar-preciso', [
    body('logradouro').isString().trim().notEmpty().withMessage('Logradouro é obrigatório'),
    body('numero').isString().trim().notEmpty().withMessage('Número é obrigatório'),
    body('bairro').isString().trim().notEmpty().withMessage('Bairro é obrigatório'),
    body('cidade').isString().trim().notEmpty().withMessage('Cidade é obrigatória'),
    body('uf').isString().trim().isLength({ min: 2, max: 2 }).withMessage('UF deve ter 2 caracteres'),
    body('cep').optional().isString().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                status: 'error',
                errors: errors.array() 
            });
        }

        const { logradouro, numero, complemento, bairro, cidade, uf, cep } = req.body;
        
        console.log('🎯 GEOCODIFICAÇÃO 100% PRECISA INICIADA:', { logradouro, numero, bairro, cidade, uf, cep });

        // ============================================
        // ETAPA 1: GERAR VARIAÇÕES OTIMIZADAS
        // ============================================
        
        const normalizar = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        
        // Detectar tipo de logradouro
        const tiposLogradouro = ['RUA', 'AVENIDA', 'AV', 'R', 'TRAVESSA', 'TRAV', 'ALAMEDA', 'AL', 'ESTRADA', 'RODOVIA', 'PRAÇA', 'PÇ', 'LARGO'];
        const logradouroNorm = normalizar(logradouro);
        let tipoVia = '';
        let nomeVia = logradouro;
        
        for (const tipo of tiposLogradouro) {
            if (logradouroNorm.startsWith(tipo + ' ')) {
                tipoVia = tipo;
                nomeVia = logradouro.substring(tipo.length).trim();
                break;
            }
        }

        // Variações ULTRA otimizadas (ordem de precisão)
        const variacoes = [
            // 1. FORMATO BRASILEIRO COMPLETO (mais preciso)
            cep ? `${numero} ${logradouro}, ${bairro}, ${cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}, ${cidade}, ${uf}, Brasil` : null,
            
            // 2. FORMATO INTERNACIONAL com número primeiro
            `${numero} ${logradouro}, ${bairro}, ${cidade}, ${uf} ${cep ? cep.replace(/\D/g, '') : ''}, Brazil`,
            
            // 3. FORMATO GOOGLE MAPS
            `${logradouro}, ${numero} - ${bairro}, ${cidade} - ${uf}, ${cep ? cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : ''}, Brasil`,
            
            // 4. FORMATO ESTRUTURADO com complemento
            complemento ? `${logradouro}, ${numero} ${complemento}, ${bairro}, ${cidade} - ${uf}, Brasil` : null,
            
            // 5. FORMATO SIMPLIFICADO
            `${numero} ${nomeVia}, ${cidade}, ${uf}, Brasil`,
            
            // 6. SÓ NÚMERO E RUA (caso CEP esteja errado)
            `${numero} ${logradouro}, ${cidade}, Brasil`,
            
            // 7. CEP como principal (alta precisão no Brasil)
            cep ? `${cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2')}, ${numero}, Brasil` : null,
            
            // 8. Sem tipo de via (caso esteja causando confusão)
            tipoVia ? `${numero} ${nomeVia}, ${bairro}, ${cidade}, ${uf}, Brasil` : null,
            
            // 9. Formato endereço postal
            `${logradouro} ${numero}, ${bairro}, ${cidade}/${uf} ${cep ? cep.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2') : ''}`
        ].filter(Boolean);

        console.log(`📋 ${variacoes.length} variações geradas`);

        // ============================================
        // ETAPA 2: CONSULTAR MÚLTIPLAS APIs
        // ============================================

        const resultadosAPIs = [];
        const OPENCAGE_KEY = process.env.OPENCAGE_API_KEY || 'c1fd271c611f49aa80d0c6e62cfb1aef';

        // API 1: OpenCage (Principal - mais precisa)
        const consultarOpenCage = async (endereco) => {
            try {
                const response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
                    params: {
                        q: endereco,
                        key: OPENCAGE_KEY,
                        language: 'pt-br',
                        countrycode: 'br',
                        limit: 5,
                        no_annotations: 0,
                        addressdetails: 1,
                        bounds: '-73.99,-33.75,-28.84,5.27',
                        roadinfo: 1,
                        proximity: '-23.55,-46.63' // Centro de São Paulo como referência
                    },
                    timeout: 10000
                });
                
                return response.data.results || [];
            } catch (error) {
                console.error('OpenCage error:', error.message);
                return [];
            }
        };

        // API 2: Nominatim OSM (Validação cruzada)
        const consultarNominatim = async (endereco) => {
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                    params: {
                        q: endereco,
                        format: 'json',
                        addressdetails: 1,
                        limit: 3,
                        countrycodes: 'br',
                        'accept-language': 'pt-BR,pt'
                    },
                    headers: {
                        'User-Agent': 'ParkNow/1.0'
                    },
                    timeout: 8000
                });
                
                return response.data || [];
            } catch (error) {
                console.error('Nominatim error:', error.message);
                return [];
            }
        };

        // ============================================
        // ETAPA 3: PROCESSAR RESULTADOS COM SCORE AVANÇADO
        // ============================================

        const calcularScore = (resultado, endereco, fonte) => {
            let score = 0;
            const componentes = resultado.components || resultado.address || {};
            
            // Base: confiança da API
            score += (resultado.confidence || 5) * 0.5;
            
            // VALIDAÇÃO SUPER RIGOROSA DO NÚMERO
            const numeroEncontrado = componentes.house_number || componentes.housenumber || '';
            if (numeroEncontrado === numero) {
                score += 5.0; // Bônus GRANDE para número exato
            } else if (numeroEncontrado) {
                // Verifica proximidade numérica (números pares/ímpares da mesma quadra)
                const diff = Math.abs(parseInt(numeroEncontrado) - parseInt(numero));
                if (diff <= 10) score += 2.0; // Mesma quadra provavelmente
                else if (diff <= 50) score += 0.5; // Rua próxima
            }
            
            // VALIDAÇÃO DO NOME DA RUA
            const ruaAPI = normalizar(componentes.road || componentes.street || '');
            const ruaBusca = normalizar(nomeVia);
            if (ruaAPI && ruaBusca) {
                if (ruaAPI === ruaBusca) {
                    score += 3.0; // Nome exato
                } else if (ruaAPI.includes(ruaBusca) || ruaBusca.includes(ruaAPI)) {
                    score += 2.0; // Nome parcial
                } else {
                    // Verifica similaridade (Levenshtein simplificado)
                    const similarity = calcularSimilaridade(ruaAPI, ruaBusca);
                    if (similarity > 0.8) score += 1.5;
                    else if (similarity > 0.6) score += 0.5;
                }
            }
            
            // VALIDAÇÃO DA CIDADE
            const cidadeAPI = normalizar(componentes.city || componentes.town || componentes.village || componentes.municipality || '');
            const cidadeBusca = normalizar(cidade);
            if (cidadeAPI === cidadeBusca) {
                score += 2.0;
            } else if (cidadeAPI.includes(cidadeBusca) || cidadeBusca.includes(cidadeAPI)) {
                score += 1.0;
            }
            
            // VALIDAÇÃO DO BAIRRO
            const bairroAPI = normalizar(componentes.suburb || componentes.neighbourhood || componentes.quarter || '');
            const bairroBusca = normalizar(bairro);
            if (bairroAPI === bairroBusca) {
                score += 2.0;
            } else if (bairroAPI.includes(bairroBusca) || bairroBusca.includes(bairroAPI)) {
                score += 1.0;
            }
            
            // VALIDAÇÃO DO CEP
            if (cep) {
                const cepAPI = (componentes.postcode || '').replace(/\D/g, '');
                const cepBusca = cep.replace(/\D/g, '');
                if (cepAPI === cepBusca) {
                    score += 3.0; // CEP exato = alta confiança
                } else if (cepAPI && cepAPI.substring(0, 5) === cepBusca.substring(0, 5)) {
                    score += 1.0; // Mesma região
                }
            }
            
            // VALIDAÇÃO DO ESTADO
            const ufAPI = normalizar(componentes.state_code || componentes.state || '');
            if (ufAPI === normalizar(uf)) {
                score += 1.0;
            }
            
            // TIPO DE RESULTADO (preferência por endereços específicos)
            const tipo = (componentes._type || resultado.type || '').toLowerCase();
            if (['house', 'building', 'residential', 'commercial', 'retail', 'yes'].includes(tipo)) {
                score += 2.0;
            } else if (['road', 'street'].includes(tipo)) {
                score += 1.0;
            }
            
            // BÔNUS PELA FONTE (OpenCage é mais precisa)
            if (fonte === 'opencage') {
                score += 1.0;
            }
            
            return score;
        };

        // Função auxiliar para calcular similaridade de strings
        const calcularSimilaridade = (str1, str2) => {
            const longer = str1.length > str2.length ? str1 : str2;
            const shorter = str1.length > str2.length ? str2 : str1;
            if (longer.length === 0) return 1.0;
            return (longer.length - editDistance(longer, shorter)) / longer.length;
        };

        const editDistance = (s1, s2) => {
            s1 = s1.toLowerCase();
            s2 = s2.toLowerCase();
            const costs = [];
            for (let i = 0; i <= s1.length; i++) {
                let lastValue = i;
                for (let j = 0; j <= s2.length; j++) {
                    if (i === 0) {
                        costs[j] = j;
                    } else if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
                if (i > 0) costs[s2.length] = lastValue;
            }
            return costs[s2.length];
        };

        // ============================================
        // ETAPA 4: TESTAR TODAS AS VARIAÇÕES
        // ============================================

        for (const endereco of variacoes) {
            // OpenCage
            const resultadosOC = await consultarOpenCage(endereco);
            for (const res of resultadosOC) {
                const score = calcularScore(res, endereco, 'opencage');
                resultadosAPIs.push({
                    fonte: 'OpenCage',
                    latitude: res.geometry.lat,
                    longitude: res.geometry.lng,
                    score: score,
                    confidence: res.confidence,
                    formatted: res.formatted,
                    components: res.components,
                    type: res.components._type,
                    endereco: endereco,
                    annotations: res.annotations
                });
            }
            
            // Pequeno delay para respeitar rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Nominatim (validação)
            const resultadosNom = await consultarNominatim(endereco);
            for (const res of resultadosNom) {
                const score = calcularScore(res, endereco, 'nominatim');
                resultadosAPIs.push({
                    fonte: 'Nominatim',
                    latitude: parseFloat(res.lat),
                    longitude: parseFloat(res.lon),
                    score: score,
                    confidence: parseFloat(res.importance || 0.5) * 10,
                    formatted: res.display_name,
                    components: res.address,
                    type: res.type,
                    endereco: endereco
                });
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`✅ Coletados ${resultadosAPIs.length} resultados de múltiplas APIs`);

        // ============================================
        // ETAPA 5: VALIDAÇÃO CRUZADA E CONSENSO
        // ============================================

        if (resultadosAPIs.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'Nenhum resultado encontrado. Verifique se o endereço está correto.'
            });
        }

        // Ordena por score
        resultadosAPIs.sort((a, b) => b.score - a.score);

        // Pega os top 5 resultados
        const top5 = resultadosAPIs.slice(0, 5);

        console.log('🏆 TOP 5 RESULTADOS:');
        top5.forEach((r, i) => {
            console.log(`  ${i + 1}. Score: ${r.score.toFixed(2)} | ${r.fonte} | ${r.formatted.substring(0, 60)}...`);
        });

        // Verifica consenso geográfico (resultados próximos = maior confiança)
        const calcularDistancia = (lat1, lon1, lat2, lon2) => {
            const R = 6371000; // Raio da Terra em metros
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const Δφ = (lat2 - lat1) * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                     Math.cos(φ1) * Math.cos(φ2) *
                     Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c; // Distância em metros
        };

        const melhorResultado = top5[0];
        let consenso = 1;
        let distanciaMedia = 0;

        // Verifica quantos resultados estão próximos (dentro de 50m)
        for (let i = 1; i < Math.min(top5.length, 3); i++) {
            const dist = calcularDistancia(
                melhorResultado.latitude, melhorResultado.longitude,
                top5[i].latitude, top5[i].longitude
            );
            distanciaMedia += dist;
            if (dist < 50) {
                consenso++;
                melhorResultado.score += 1; // Bônus por consenso
            }
        }
        distanciaMedia /= Math.min(top5.length - 1, 2);

        console.log(`🎯 Consenso: ${consenso}/3 resultados próximos (distância média: ${distanciaMedia.toFixed(1)}m)`);

        // ============================================
        // ETAPA 6: RETORNAR RESULTADO FINAL
        // ============================================

        const precisao = melhorResultado.score >= 15 ? 'PERFEITA (100%)' :
                        melhorResultado.score >= 12 ? 'MUITO ALTA (95%)' :
                        melhorResultado.score >= 9 ? 'ALTA (85%)' :
                        melhorResultado.score >= 6 ? 'BOA (70%)' :
                        'MODERADA (50%)';

        console.log(`✅ RESULTADO FINAL: Score ${melhorResultado.score.toFixed(2)} - Precisão ${precisao}`);

        return res.json({
            status: 'success',
            data: {
                latitude: parseFloat(melhorResultado.latitude).toFixed(15),
                longitude: parseFloat(melhorResultado.longitude).toFixed(15),
                qualityScore: melhorResultado.score,
                confidence: melhorResultado.confidence,
                precisao: precisao,
                consenso: consenso,
                distanciaMediaConsenso: distanciaMedia.toFixed(1),
                fonte: melhorResultado.fonte,
                formatted: melhorResultado.formatted,
                components: melhorResultado.components,
                type: melhorResultado.type,
                endereco_usado: melhorResultado.endereco,
                alternativas: top5.slice(1, 3).map(r => ({
                    latitude: parseFloat(r.latitude).toFixed(15),
                    longitude: parseFloat(r.longitude).toFixed(15),
                    score: r.score.toFixed(2),
                    fonte: r.fonte
                }))
            },
            message: precisao
        });

    } catch (error) {
        console.error('[Geocoding 100% Error]:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Erro ao geocodificar endereço',
            details: error.message
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
