require('dotenv').config();
const asaasService = require('./services/asaasMarketplaceService');

async function configurarWebhook() {
  try {
    console.log('🔧 Configurando webhook no ASAAS...');

    // Resolver a URL do webhook
    const appUrl = process.env.APP_URL || process.env.BASE_URL;
    const webhookUrl = `${appUrl}/api/webhooks/asaas`;

    if (!webhookUrl || webhookUrl.includes('${')) {
      console.error('❌ URL do webhook inválida:', webhookUrl);
      return;
    }

    console.log(`📡 URL do webhook: ${webhookUrl}`);

    // Criar webhook para pagamentos - campos mínimos necessários
    const webhookData = {
      name: 'ParkNow Webhook',
      url: webhookUrl,
      sendType: 'SEQUENTIALLY',
      enabled: true,
      poolInterrupted: false,
      email: 'parknow914@gmail.com',
      events: ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']
    };

    console.log('📝 Criando webhook com eventos:', webhookData.events.join(', '));

    const response = await asaasService.client.post('/webhooks', webhookData);

    console.log('✅ Webhook criado com sucesso!');
    console.log('📋 Detalhes do webhook:');
    console.log(`   ID: ${response.data.id}`);
    console.log(`   Nome: ${response.data.name}`);
    console.log(`   URL: ${response.data.url}`);
    console.log(`   Eventos: ${response.data.events?.join(', ') || 'Nenhum'}`);
    console.log(`   Ativo: ${response.data.enabled ? 'Sim' : 'Não'}`);

  } catch (error) {
    console.error('❌ Erro ao configurar webhook:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Dados:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('   Detalhes do erro:', error.message);
    }
  }
}

configurarWebhook();