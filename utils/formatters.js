/**
 * Formata um valor numérico para o formato de moeda brasileira (R$)
 * @param {number} value - Valor numérico a ser formatado
 * @param {Object} [options] - Opções de formatação
 * @param {number} [options.decimals=2] - Número de casas decimais
 * @param {string} [options.decimalSeparator=','] - Separador decimal
 * @param {string} [options.thousandsSeparator='.'] - Separador de milhar
 * @param {string} [options.currency='R$'] - Símbolo da moeda
 * @returns {string} Valor formatado como moeda
 */
function formatCurrency(value, options = {}) {
    const {
        decimals = 2,
        decimalSeparator = ',',
        thousandsSeparator = '.',
        currency = 'R$ '
    } = options;

    if (value === null || value === undefined || isNaN(value)) {
        return `${currency}0,00`;
    }

    // Garante que o valor seja um número
    const number = typeof value === 'string' ? parseFloat(value) : Number(value);

    // Formata o número com as casas decimais corretas
    const parts = number.toFixed(decimals).split('.');
    
    // Adiciona os separadores de milhar
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
    
    // Junta as partes com o separador decimal
    return `${currency}${parts.join(decimalSeparator)}`;
}

/**
 * Formata uma data para o formato brasileiro (DD/MM/YYYY)
 * @param {Date|string|number} date - Data a ser formatada
 * @param {Object} [options] - Opções de formatação
 * @param {boolean} [options.includeTime=false] - Incluir hora na formatação
 * @returns {string} Data formatada
 */
function formatDate(date, options = {}) {
    const { includeTime = false } = options;
    
    if (!date) return '';
    
    const d = new Date(date);
    
    if (isNaN(d.getTime())) return 'Data inválida';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    if (!includeTime) {
        return `${day}/${month}/${year}`;
    }
    
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formata um CPF ou CNPJ
 * @param {string} value - CPF ou CNPJ para formatar
 * @returns {string} CPF ou CNPJ formatado
 */
function formatCpfCnpj(value) {
    if (!value) return '';
    
    // Remove caracteres não numéricos
    const numbers = value.replace(/\D/g, '');
    
    // Formata CPF (11 dígitos)
    if (numbers.length === 11) {
        return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    
    // Formata CNPJ (14 dígitos)
    if (numbers.length === 14) {
        return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    
    // Retorna o valor original se não for CPF nem CNPJ
    return value;
}

/**
 * Formata um número de telefone
 * @param {string} phone - Número de telefone para formatar
 * @returns {string} Telefone formatado
 */
function formatPhone(phone) {
    if (!phone) return '';
    
    // Remove caracteres não numéricos
    const numbers = phone.replace(/\D/g, '');
    
    // Formata celular com 9º dígito
    if (numbers.length === 11) {
        return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    
    // Formata número fixo
    if (numbers.length === 10) {
        return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    
    // Retorna o valor original se não for um telefone válido
    return phone;
}

// Alias para manter compatibilidade com código existente
const formatarMoeda = formatCurrency;

module.exports = {
    formatCurrency,
    formatarMoeda, // Alias para compatibilidade
    formatDate,
    formatCpfCnpj,
    formatPhone
};
