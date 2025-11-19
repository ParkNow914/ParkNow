require('dotenv').config();
const asaasService = require('./services/asaasMarketplaceService');

async function verificarStatusRecente() {
  try {
    console.log('🔍 Verificando pagamentos recentes...');

    // Buscar pagamentos recentes
    const response = await asaasService.client.get('/payments', {
      params: {
        limit: 5,
        offset: 0
      }
    });

    console.log('📊 Últimos 5 pagamentos:');
    response.data.data.forEach((payment, index) => {
      console.log(`${index + 1}. ID: ${payment.id}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Valor: R$ ${payment.value}`);
      console.log(`   Método: ${payment.billingType}`);
      console.log(`   Data: ${payment.dateCreated}`);
      console.log(`   Descrição: ${payment.description}`);
      if (payment.status === 'PENDING') {
        console.log(`   ❌ Pendente - pode estar expirado`);
      } else if (payment.status === 'RECEIVED') {
        console.log(`   ✅ Recebido com sucesso`);
      } else if (payment.status === 'OVERDUE') {
        console.log(`   ⏰ Expirado`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro ao verificar pagamentos:', error.message);
  }
}

verificarStatusRecente();