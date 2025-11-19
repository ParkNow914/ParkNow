require('dotenv').config();
const asaasService = require('./services/asaasMarketplaceService');

async function verificarWebhookConfig() {
  try {
    console.log('🔍 Verificando configuração de webhook no ASAAS...');

    // Verificar webhooks configurados
    const response = await asaasService.client.get('/webhooks', {
      params: {
        limit: 10,
        offset: 0
      }
    });

    console.log('📋 Webhooks configurados:');
    if (response.data.data && response.data.data.length > 0) {
      response.data.data.forEach((webhook, index) => {
        console.log(`${index + 1}. ID: ${webhook.id}`);
        console.log(`   URL: ${webhook.url}`);
        console.log(`   Eventos: ${webhook.events?.join(', ') || 'Nenhum'}`);
        console.log(`   Ativo: ${webhook.active ? 'Sim' : 'Não'}`);
        console.log(`   Última execução: ${webhook.lastExecution}`);
        console.log('');
      });
    } else {
      console.log('❌ Nenhum webhook configurado');
    }

    // Verificar se existe webhook para PAYMENT_RECEIVED
    const paymentWebhook = response.data.data?.find(w =>
      w.events?.includes('PAYMENT_RECEIVED') ||
      w.events?.includes('PAYMENT_CONFIRMED')
    );

    if (paymentWebhook) {
      console.log('✅ Webhook de pagamento encontrado:', paymentWebhook.url);
    } else {
      console.log('⚠️ Nenhum webhook configurado para eventos de pagamento');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar webhooks:', error.message);
  }
}

verificarWebhookConfig();