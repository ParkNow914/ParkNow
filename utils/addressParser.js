/**
 * Módulo avançado de análise e normalização de endereços brasileiros
 */

const cepPromise = require('cep-promise');

// Dicionário de abreviações comuns em endereços brasileiros
const ABREVIACOES = {
    'RUA': 'R',
    'AVENIDA': 'AV',
    'AV': 'AV',
    'ALAMEDA': 'AL',
    'ALAM': 'AL',
    'AL': 'AL',
    'PRAÇA': 'PC',
    'PCA': 'PC',
    'TRAVESSA': 'TV',
    'TRAV': 'TV',
    'TV': 'TV',
    'RODOVIA': 'ROD',
    'ROD': 'ROD',
    'ESTRADA': 'EST',
    'EST': 'EST',
    'BLOCO': 'BL',
    'BL': 'BL',
    'APARTAMENTO': 'APTO',
    'APTO': 'APTO',
    'SALA': 'SL',
    'ANDAR': 'AND',
    'CONJUNTO': 'CJ',
    'CJ': 'CJ',
    'LOTE': 'LT',
    'QUADRA': 'QD',
    'QD': 'QD',
    'LOTEAMENTO': 'LOT',
    'LOT': 'LOT'
};

// Tipos de logradouro reconhecidos
const TIPOS_LOGRADOURO = new Set([
    'RUA', 'AVENIDA', 'AV', 'ALAMEDA', 'AL', 'PRAÇA', 'PCA', 'TRAVESSA', 'TV',
    'RODOVIA', 'ROD', 'ESTRADA', 'EST', 'VIELA', 'VIA', 'VIADUTO', 'VALE', 'VEREDA',
    'VEREDINHA', 'VIA', 'VIADUTO', 'VIELA', 'VILA', 'VILAREJO', 'VALE', 'VIA', 'VIA DE PEDESTRE'
]);

/**
 * Normaliza um texto removendo acentos, caracteres especiais e espaços extras
 * @param {string} texto - Texto a ser normalizado
 * @returns {string} Texto normalizado
 */
function normalizarTexto(texto) {
    if (!texto) return '';
    
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .toUpperCase()
        .replace(/[^A-Z0-9\s,.-]/g, '') // Mantém letras, números, espaços, vírgulas, pontos e hífens
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Padroniza o tipo de logradouro (ex: 'R' -> 'RUA', 'AV' -> 'AVENIDA')
 * @param {string} tipo - Tipo de logradouro a ser padronizado
 * @returns {string} Tipo de logradouro padronizado
 */
function padronizarTipoLogradouro(tipo) {
    if (!tipo) return '';
    
    const tipoNormalizado = normalizarTexto(tipo);
    const tipoSemPonto = tipoNormalizado.replace(/\./g, ''); // Remove pontos
    
    // Retorna a forma expandida se for uma abreviação conhecida
    for (const [expandido, abreviado] of Object.entries(ABREVIACOES)) {
        if (tipoSemPonto === abreviado) {
            return expandido;
        }
    }
    
    // Se for um tipo de logradouro reconhecido, retorna em maiúsculas
    if (TIPOS_LOGRADOURO.has(tipoNormalizado)) {
        return tipoNormalizado;
    }
    
    return tipoNormalizado;
}

/**
 * Extrai e padroniza o número do endereço
 * @param {string} numero - Número do endereço
 * @returns {{numero: string, complemento: string}} Objeto com número e complemento separados
 */
function extrairNumero(numero) {
    if (!numero) return { numero: '', complemento: '' };
    
    const str = String(numero).trim();
    
    // Casos como "123A", "123 B"
    const match = str.match(/^(\d+)\s*([A-Za-z])?$/i);
    if (match) {
        return {
            numero: match[1],
            complemento: match[2] ? `LETRA ${match[2].toUpperCase()}` : ''
        };
    }
    
    // Casos como "123/456"
    const matchSlash = str.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (matchSlash) {
        return {
            numero: matchSlash[1],
            complemento: `APTO ${matchSlash[2]}`
        };
    }
    
    // Caso genérico
    return {
        numero: str,
        complemento: ''
    };
}

/**
 * Valida um CEP brasileiro
 * @param {string} cep - CEP a ser validado
 * @returns {boolean} Verdadeiro se o CEP for válido
 */
function validarCEP(cep) {
    if (!cep) return false;
    const cepLimpo = cep.replace(/\D/g, '');
    return /^\d{8}$/.test(cepLimpo);
}

/**
 * Busca informações de endereço a partir de um CEP
 * @param {string} cep - CEP a ser consultado
 * @returns {Promise<Object>} Dados do endereço
 */
async function buscarPorCEP(cep) {
    try {
        if (!validarCEP(cep)) {
            throw new Error('CEP inválido');
        }
        
        const resultado = await cepPromise(cep);
        
        // Padroniza os dados de retorno
        return {
            logradouro: resultado.street || '',
            bairro: resultado.neighborhood || '',
            cidade: resultado.city || '',
            uf: resultado.state || '',
            cep: resultado.cep ? resultado.cep.replace(/\D/g, '') : '',
            origem: 'api_cep'
        };
    } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        throw new Error('Erro ao consultar CEP. Verifique o número e tente novamente.');
    }
}

/**
 * Analisa um endereço completo em suas partes componentes
 * @param {string} endereco - Endereço completo
 * @returns {Object} Objeto com as partes do endereço
 */
function analisarEndereco(endereco) {
    console.log('Analisando endereço:', endereco);
    
    if (!endereco || typeof endereco !== 'string') {
        console.log('Endereço inválido ou vazio');
        return {};
    }
    
    // Normaliza o endereço: remove múltiplos espaços, normaliza vírgulas, etc.
    const enderecoNormalizado = endereco
        .replace(/\s+/g, ' ')
        .replace(/,\s*,/g, ',')
        .replace(/\s*,\s*/g, ', ')
        .trim();
    
    console.log('Endereço normalizado:', enderecoNormalizado);
    
    // Divide o endereço em partes usando vírgula como separador
    let partes = enderecoNormalizado.split(',').map(p => p.trim()).filter(Boolean);
    
    if (partes.length < 2) {
        console.log('Endereço com formato inválido - menos de 2 partes');
        return {};
    }
    
    console.log('Partes do endereço:', partes);
    
    // Extrai logradouro e número
    let logradouroCompleto = partes[0];
    let numero = '';
    let complemento = '';
    
    // Tenta extrair número e complemento da segunda parte
    if (partes.length > 1) {
        const numeroInfo = extrairNumero(partes[1]);
        numero = numeroInfo.numero;
        complemento = numeroInfo.complemento;
    }
    
    // Tenta extrair o tipo de logradouro
    const palavrasLogradouro = logradouroCompleto.split(/\s+/);
    let tipoLogradouro = '';
    let nomeLogradouro = logradouroCompleto;
    
    if (palavrasLogradouro.length > 1) {
        const primeiroTermo = palavrasLogradouro[0].toUpperCase();
        if (TIPOS_LOGRADOURO.has(primeiroTermo)) {
            tipoLogradouro = padronizarTipoLogradouro(primeiroTermo);
            nomeLogradouro = palavrasLogradouro.slice(1).join(' ').trim();
        }
    }
    
    // Tenta extrair bairro, cidade e UF das partes restantes
    let bairro = '';
    let cidade = '';
    let uf = '';
    
    // Tenta encontrar o bairro (geralmente na terceira parte)
    if (partes.length >= 3) {
        bairro = partes[2].replace(/^BAIRRO\s*/i, '').trim();
    }
    
    // Tenta extrair cidade e UF (geralmente na quarta parte)
    if (partes.length >= 4) {
        const cidadeUfParte = partes[3].trim();
        const cidadeUfMatch = cidadeUfParte.match(/([^-]+)(?:-\s*([A-Z]{2}))?/i);
        
        if (cidadeUfMatch) {
            cidade = cidadeUfMatch[1].trim();
            if (cidadeUfMatch[2]) {
                uf = cidadeUfMatch[2].trim().toUpperCase();
            }
        } else {
            // Se não conseguiu extrair no formato padrão, assume que é a cidade
            cidade = cidadeUfParte;
        }
    }
    
    // Tenta extrair CEP se estiver presente em qualquer parte do endereço
    let cep = '';
    const cepMatch = endereco.match(/\b\d{5}[-\s]?\d{3}\b/);
    if (cepMatch) {
        cep = cepMatch[0].replace(/\D/g, '');
    }
    
    const resultado = {
        tipoLogradouro,
        logradouro: nomeLogradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        cep,
        enderecoOriginal: endereco
    };
    
    console.log('Endereço analisado:', JSON.stringify(resultado, null, 2));
    return resultado;
}

/**
 * Formata um endereço de forma padronizada
 * @param {Object} endereco - Objeto com as partes do endereço
 * @param {Object} opcoes - Opções de formatação
 * @returns {string} Endereço formatado
 */
function formatarEndereco(endereco, opcoes = {}) {
    const {
        incluirTipoLogradouro = true,
        incluirNumero = true,
        incluirComplemento = true,
        incluirBairro = true,
        incluirCidade = true,
        incluirUF = true,
        incluirCEP = true,
        separador = ', ',
        formatoCEP = '#####-###',
        tipoNumero = 'Nº'
    } = opcoes;
    
    const partes = [];
    
    // Logradouro
    const logradouro = [];
    if (incluirTipoLogradouro && endereco.tipoLogradouro) {
        logradouro.push(endereco.tipoLogradouro);
    }
    if (endereco.logradouro) {
        logradouro.push(endereco.logradouro);
    }
    
    if (logradouro.length > 0) {
        partes.push(logradouro.join(' '));
    }
    
    // Número e complemento
    const numeroCompleto = [];
    if (incluirNumero && endereco.numero) {
        numeroCompleto.push(tipoNumero ? `${tipoNumero} ${endereco.numero}` : endereco.numero);
    }
    if (incluirComplemento && endereco.complemento) {
        numeroCompleto.push(endereco.complemento);
    }
    
    if (numeroCompleto.length > 0) {
        partes.push(numeroCompleto.join(' '));
    }
    
    // Bairro
    if (incluirBairro && endereco.bairro) {
        partes.push(`BAIRRO ${endereco.bairro}`.replace(/BAIRRO\s+/i, 'BAIRRO '));
    }
    
    // Cidade e UF
    const cidadeUF = [];
    if (incluirCidade && endereco.cidade) {
        cidadeUF.push(endereco.cidade);
    }
    if (incluirUF && endereco.uf) {
        cidadeUF.push(endereco.uf);
    }
    
    if (cidadeUF.length > 0) {
        partes.push(cidadeUF.join(' - '));
    }
    
    // CEP
    if (incluirCEP && endereco.cep) {
        let cepFormatado = endereco.cep;
        if (formatoCEP) {
            cepFormatado = endereco.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
        }
        partes.push(`CEP: ${cepFormatado}`);
    }
    
    return partes.join(separador);
}

/**
 * Gera variações de um endereço para tentativas de geocodificação
 * @param {Object} endereco - Objeto com as partes do endereço
 * @returns {string[]} Array com variações do endereço
 */
function gerarVariacoesEndereco(endereco) {
    const variacoes = [];
    
    // Formato completo
    variacoes.push(formatarEndereco(endereco, {
        tipoNumero: 'Nº',
        separador: ', '
    }));
    
    // Sem tipo de logradouro
    variacoes.push(formatarEndereco({
        ...endereco,
        tipoLogradouro: ''
    }, {
        tipoNumero: 'Nº',
        separador: ', '
    }));
    
    // Com barra para número
    if (endereco.numero) {
        variacoes.push(
            `${endereco.tipoLogradouro ? endereco.tipoLogradouro + ' ' : ''}${endereco.logradouro} / ${endereco.numero}, ` +
            `${endereco.bairro ? endereco.bairro + ', ' : ''}${endereco.cidade || ''} - ${endereco.uf || ''}`
        );
    }
    
    // Sem bairro
    variacoes.push(formatarEndereco({
        ...endereco,
        bairro: ''
    }, {
        tipoNumero: 'Nº',
        separador: ', '
    }));
    
    // Apenas rua, número, cidade e UF
    variacoes.push(
        `${endereco.logradouro}, ${endereco.numero || 'S/N'}, ${endereco.cidade || ''} - ${endereco.uf || ''}`
    );
    
    // Remove duplicatas
    return [...new Set(variacoes)];
}

module.exports = {
    normalizarTexto,
    padronizarTipoLogradouro,
    extrairNumero,
    validarCEP,
    buscarPorCEP,
    analisarEndereco,
    formatarEndereco,
    gerarVariacoesEndereco
};
