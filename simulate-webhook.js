/**
 * Script para simular webhook do Asaas
 * Use para testar o fluxo sem precisar de pagamento real
 */

const axios = require('axios');

async function simularWebhookPagamentoConfirmado(paymentId, reservaId) {
    const webhookPayload = {
        event: 'PAYMENT_CONFIRMED',
        payment: {
            id: paymentId,
            status: 'CONFIRMED',
            value: 20.00,
            netValue: 20.00,
            billingType: 'PIX',
            confirmedDate: new Date().toISOString(),
            externalReference: `reserva_${reservaId}`,
            description: `Reserva #${reservaId} - ParkNow`
        }
    };

    console.log('\n🔔 Simulando webhook do Asaas:');
    console.log(JSON.stringify(webhookPayload, null, 2));

    try {
        const response = await axios.post('http://localhost:3000/api/webhooks/asaas', webhookPayload);
        
        console.log('\n✅ Webhook processado com sucesso!');
        console.log('Status:', response.status);
        console.log('Resposta:', response.data);
    } catch (error) {
        console.error('\n❌ Erro ao enviar webhook:');
        console.error('Status:', error.response?.status);
        console.error('Erro:', error.response?.data || error.message);
    }
}

// Pegar parâmetros da linha de comando
const paymentId = process.argv[2] || 'pay_test123';
const reservaId = process.argv[3] || '55';

console.log('\n╔════════════════════════════════════════════╗');
console.log('║   Simulador de Webhook Asaas - ParkNow    ║');
console.log('╚════════════════════════════════════════════╝\n');

console.log(`Payment ID: ${paymentId}`);
console.log(`Reserva ID: ${reservaId}\n`);

simularWebhookPagamentoConfirmado(paymentId, reservaId);
