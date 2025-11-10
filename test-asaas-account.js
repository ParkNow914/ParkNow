/**
 * Script para testar e verificar o status da conta Asaas Sandbox
 */

require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.ASAAS_SANDBOX === 'true' 
    ? process.env.ASAAS_SANDBOX_API_KEY 
    : process.env.ASAAS_API_KEY;

const baseURL = process.env.ASAAS_SANDBOX === 'true'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

const client = axios.create({
    baseURL,
    headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
    }
});

async function verificarConta() {
    console.log('\n🔍 Verificando conta Asaas...\n');
    console.log('Ambiente:', process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO');
    console.log('Base URL:', baseURL);
    console.log('API Key (início):', apiKey?.substring(0, 20) + '...\n');

    try {
        // 1. Verificar conta
        console.log('📋 1. Informações da conta:');
        const accountResponse = await client.get('/myAccount');
        console.log(JSON.stringify(accountResponse.data, null, 2));

        // 2. Testar criar um cliente
        console.log('\n👤 2. Testando criar cliente:');
        const customerResponse = await client.post('/customers', {
            name: 'Teste Cliente',
            email: 'teste@teste.com',
            cpfCnpj: '12345678909'
        });
        console.log('✅ Cliente criado:', customerResponse.data.id);

        // 3. Testar criar cobrança PIX
        console.log('\n💰 3. Testando criar cobrança PIX:');
        const paymentResponse = await client.post('/payments', {
            customer: customerResponse.data.id,
            billingType: 'PIX',
            value: 10.00,
            dueDate: new Date().toISOString().split('T')[0],
            description: 'Teste PIX Sandbox'
        });
        console.log('✅ Cobrança criada:', paymentResponse.data.id);
        console.log('Status:', paymentResponse.data.status);

        // 4. Tentar gerar QR Code PIX
        console.log('\n📱 4. Testando gerar QR Code PIX:');
        const pixResponse = await client.get(`/payments/${paymentResponse.data.id}/pixQrCode`);
        console.log('✅ QR Code gerado com sucesso!');
        console.log('Payload PIX disponível:', !!pixResponse.data.payload);

        console.log('\n✅ TODOS OS TESTES PASSARAM! Sua conta Asaas está funcionando corretamente.\n');

    } catch (error) {
        console.error('\n❌ ERRO:', error.message);
        
        if (error.response?.data) {
            console.error('\n📄 Detalhes do erro Asaas:');
            console.error(JSON.stringify(error.response.data, null, 2));
        }

        if (error.response?.status) {
            console.error('\n🔢 Status HTTP:', error.response.status);
        }

        console.error('\n💡 Possíveis soluções:');
        console.error('1. Verifique se a API Key está correta no .env');
        console.error('2. Acesse o painel Asaas e habilite PIX');
        console.error('3. Verifique se a conta sandbox está aprovada');
        console.error('4. Gere uma nova API Key no painel\n');
    }
}

verificarConta();
