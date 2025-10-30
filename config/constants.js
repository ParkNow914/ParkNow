/**
 * Tipos de chave PIX suportados
 * @type {string[]}
 */
const PIX_KEY_TYPES = [
    'CPF',          // Chave PIX do tipo CPF (apenas números)
    'CNPJ',         // Chave PIX do tipo CNPJ (apenas números)
    'EMAIL',        // Chave PIX do tipo e-mail
    'TELEFONE',     // Chave PIX do tipo telefone (apenas números com DDD)
    'ALEATORIA'     // Chave PIX aleatória (gerada pelo banco)
];

/**
 * Tipos de chave PIX suportados (apenas os valores)
 * @type {string[]}
 */
const PIX_KEY_TYPES_VALUES = PIX_KEY_TYPES;

/**
 * Status possíveis para um pagamento
 */
const PAYMENT_STATUS = {
    PENDENTE: 'pendente',          // Pagamento aguardando confirmação
    PROCESSANDO: 'processando',    // Pagamento em processamento
    APROVADO: 'aprovado',         // Pagamento aprovado e confirmado
    RECUSADO: 'recusado',         // Pagamento recusado
    ESTORNADO: 'estornado',       // Pagamento estornado
    CANCELADO: 'cancelado',       // Pagamento cancelado
    EXPIRADO: 'expirado',         // Pagamento não realizado dentro do prazo
    REEMBOLSADO: 'reembolsado'    // Valor reembolsado ao cliente
};

/**
 * Métodos de pagamento suportados
 */
const PAYMENT_METHODS = {
    PIX: 'pix',
    CARTAO_CREDITO: 'cartao_credito',
    CARTAO_DEBITO: 'cartao_debito',
    BOLETO: 'boleto',
    DINHEIRO: 'dinheiro'
};

/**
 * Tipos de conta bancária
 * @type {Object}
 */
const BANK_ACCOUNT_TYPES = {
    CONTA_CORRENTE: 'CONTA_CORRENTE',
    CONTA_POUPANCA: 'CONTA_POUPANCA',
    CONTA_PAGAMENTO: 'CONTA_PAGAMENTO'
};

/**
 * Valores dos tipos de conta bancária (para validação)
 * @type {string[]}
 */
const BANK_ACCOUNT_TYPES_VALUES = Object.values(BANK_ACCOUNT_TYPES);

/**
 * Configurações padrão para pagamentos
 */
const DEFAULT_PAYMENT_SETTINGS = {
    // Tempo de expiração de uma cobrança PIX em segundos (padrão: 1 hora)
    PIX_EXPIRATION_TIME: 3600,
    
    // Taxa de processamento por método de pagamento (em porcentagem)
    PAYMENT_FEES: {
        [PAYMENT_METHODS.PIX]: 0.99,           // 0.99% para PIX
        [PAYMENT_METHODS.CARTAO_DEBITO]: 1.99, // 1.99% para débito
        [PAYMENT_METHODS.CARTAO_CREDITO]: 3.49,// 3.49% para crédito
        [PAYMENT_METHODS.BOLETO]: 1.45,        // 1.45% para boleto
        [PAYMENT_METHODS.DINHEIRO]: 0          // Sem taxa para dinheiro
    },
    
    // Dias para liberação do pagamento por método
    PAYMENT_RELEASE_DAYS: {
        [PAYMENT_METHODS.PIX]: 0,              // Imediato
        [PAYMENT_METHODS.CARTAO_DEBITO]: 1,    // 1 dia útil
        [PAYMENT_METHODS.CARTAO_CREDITO]: 30,  // 30 dias (prazo médio de recebimento)
        [PAYMENT_METHODS.BOLETO]: 3,           // 3 dias úteis
        [PAYMENT_METHODS.DINHEIRO]: 0          // Imediato
    }
};

module.exports = {
    PIX_KEY_TYPES,
    PAYMENT_STATUS,
    PAYMENT_METHODS,
    BANK_ACCOUNT_TYPES,
    DEFAULT_PAYMENT_SETTINGS
};
