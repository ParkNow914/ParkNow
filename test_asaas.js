require('dotenv').config();

console.log('=== VERIFICAÇÃO DE CONFIGURAÇÃO ASAAS ===');
console.log('ASAAS_SANDBOX:', process.env.ASAAS_SANDBOX);
console.log('ASAAS_SANDBOX_API_KEY presente:', !!process.env.ASAAS_SANDBOX_API_KEY);
console.log('ASAAS_SANDBOX_API_KEY length:', process.env.ASAAS_SANDBOX_API_KEY ? process.env.ASAAS_SANDBOX_API_KEY.length : 0);

const asaasService = require('./services/asaasMarketplaceService');

async function testAsaas() {
  try {
    console.log('\n=== TESTANDO CONEXÃO COM ASAAS ===');

    // Primeiro, vamos verificar se conseguimos instanciar o serviço
    console.log('Serviço Asaas instanciado com sucesso');

    // Tentar criar um pagamento PIX simples
    console.log('Tentando criar pagamento PIX...');
    const result = await asaasService.criarPagamentoPixComSplit({
      valor: 10.00,
      descricao: 'Teste PIX',
      email_pagador: 'teste@example.com',
      nome_pagador: 'Teste Usuario',
      cpf_pagador: '52998224725',
      estacionamento_id: 1,
      estacionamento_asaas_account_id: null,
      reserva_id: 999
    });

    console.log('✅ SUCESSO! Resultado:', {
      payment_id: result.payment_id,
      status: result.status,
      qr_code_presente: !!result.qr_code,
      qr_code_length: result.qr_code ? result.qr_code.length : 0
    });

  } catch (error) {
    console.error('❌ ERRO no teste Asaas:', error.message);
    if (error.response?.data) {
      console.error('Detalhes do erro:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAsaas();