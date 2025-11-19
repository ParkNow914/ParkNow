const axios = require('axios');

async function testarWebhookComTunnel() {
  try {
    console.log('🧪 Testando webhook com túnel LocalTunnel...');

    // URL do túnel configurado
    const tunnelUrl = 'https://parknow-tunnel.loca.lt';
    const webhookUrl = `${tunnelUrl}/api/webhooks/asaas`;

    console.log('🌐 URL do túnel:', tunnelUrl);
    console.log('📡 Endpoint webhook:', webhookUrl);

    // Simular webhook de teste
    const testPayload = {
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_tunnel',
        status: 'RECEIVED',
        value: 5.00,
        externalReference: 'teste_tunnel'
      }
    };

    console.log('📤 Enviando webhook de teste...');

    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Tunnel-Test/1.0'
      },
      timeout: 15000
    });

    console.log('✅ Webhook via túnel funcionou!');
    console.log('📊 Status:', response.status);
    console.log('📄 Resposta:', response.data);

    console.log('\n🎉 Túnel LocalTunnel está funcionando perfeitamente!');
    console.log('📋 Use esta URL no ASAAS:', webhookUrl);

  } catch (error) {
    console.error('❌ Erro no teste do túnel:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Solução: Execute "npm run dev-tunnel" para iniciar servidor + túnel');
    } else if (error.response) {
      console.log('📊 Status do erro:', error.response.status);
    } else {
      console.log('💡 Verifique se o túnel está ativo e a URL está correta');
    }
  }
}

testarWebhookComTunnel();