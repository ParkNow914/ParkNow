const { payload } = require('pix-payload');
const QRCode = require('qrcode');

// Dados de teste usando as credenciais reais do estacionamento
const pixData = {
    chavePix: '19867505000186', // CNPJ do Silcar Estacionamento
    nomeTitular: 'Silcar Estacionamento LTDA',
    valor: 15.00,
    descricao: 'Pagamento de estacionamento - Teste',
    cidade: 'SAO PAULO',
    txid: 'TEST' + Date.now()
};

console.log('Testando geração de QR Code PIX...\n');
console.log('Dados:', JSON.stringify(pixData, null, 2));

async function testarPixQRCode() {
    try {
        // Cria o payload PIX real seguindo o padrão BR Code
        const pixPayloadString = payload({
            key: pixData.chavePix,           // Chave PIX (CNPJ, CPF, email, telefone ou chave aleatória)
            name: pixData.nomeTitular,        // Nome do beneficiário
            city: pixData.cidade,             // Cidade do beneficiário
            amount: pixData.valor,            // Valor da transação
            transactionId: pixData.txid       // Identificador único da transação
        });

        console.log('\n✅ Payload PIX gerado com sucesso!');
        console.log('Tamanho:', pixPayloadString.length, 'caracteres');
        console.log('Payload (copia e cola):', pixPayloadString);

        // Gera o QR Code em formato base64
        const qrCodeBase64 = await QRCode.toDataURL(pixPayloadString, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        console.log('\n✅ QR Code gerado com sucesso!');
        console.log('Formato:', qrCodeBase64.substring(0, 50) + '...');
        console.log('Tamanho total:', qrCodeBase64.length, 'caracteres');

        return {
            qr_code: qrCodeBase64,
            qr_code_text: pixPayloadString,
            chave_pix: pixData.chavePix,
            nome_titular: pixData.nomeTitular,
            valor: pixData.valor
        };

    } catch (error) {
        console.error('\n❌ Erro ao gerar QR Code PIX:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Executa o teste
testarPixQRCode()
    .then(result => {
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
        console.log('Resultado final:', {
            qr_code_length: result.qr_code.length,
            qr_code_text_length: result.qr_code_text.length,
            chave_pix: result.chave_pix,
            nome_titular: result.nome_titular,
            valor: result.valor
        });
    })
    .catch(error => {
        console.error('\n❌ TESTE FALHOU!');
        process.exit(1);
    });
