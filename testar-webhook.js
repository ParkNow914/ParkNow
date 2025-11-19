const axios = require('axios');

async function testarWebhookEndpoint() {
  try {
    console.log('🧪 Testando endpoint do webhook...');

    // Servidor está rodando na porta 3000
    const webhookUrl = 'http://localhost:3000/api/webhooks/asaas';

    // Simular uma notificação de webhook
    const testPayload = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_fut7v40d2n34o2mc',
        status: 'RECEIVED',
        value: 10.00,
        netValue: 8.50,
        externalReference: 'reserva_teste'
      }
    };

    console.log('📤 Enviando payload de teste para:', webhookUrl);
    console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));

    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Webhook-Test/1.0'
      },
      timeout: 10000
    });

    console.log('✅ Webhook endpoint respondeu!');
    console.log('📊 Status:', response.status);
    console.log('📄 Resposta:', response.data);

  } catch (error) {
    console.error('❌ Erro ao testar webhook endpoint:', error.message);
    if (error.response) {
      console.log('📊 Status da resposta:', error.response.status);
      console.log('📄 Resposta de erro:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🚫 Servidor não está respondendo. Verifique se o servidor está rodando.');
    }
  }
}

testarWebhookEndpoint();