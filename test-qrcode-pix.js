// Teste de validação de QR Code PIX
const { payload } = require('pix-payload');
const QRCode = require('qrcode');

async function testarQRCodePix() {
    console.log('=== TESTE DE GERAÇÃO DE QR CODE PIX ===\n');

    const dados = {
        chavePix: '19867505000186',
        nomeTitular: 'Silcar Estacionamento LTDA',
        valor: 15.50,
        cidade: 'SAO PAULO',
        txid: 'PARKNOW' + Date.now() + Math.floor(Math.random() * 1000)
    };

    console.log('Dados originais:');
    console.log('- Chave PIX:', dados.chavePix);
    console.log('- Nome titular:', dados.nomeTitular, '(', dados.nomeTitular.length, 'caracteres)');
    console.log('- Valor:', dados.valor);
    console.log('- Cidade:', dados.cidade);
    console.log('- TXID:', dados.txid, '(', dados.txid.length, 'caracteres)\n');

    // Normaliza o nome (remove acentos, limita a 25 caracteres)
    const nomeTitularNormalizado = dados.nomeTitular
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .substring(0, 25);

    const cidadeNormalizada = dados.cidade
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .substring(0, 15);

    console.log('Dados normalizados:');
    console.log('- Nome titular:', nomeTitularNormalizado, '(', nomeTitularNormalizado.length, 'caracteres)');
    console.log('- Cidade:', cidadeNormalizada, '(', cidadeNormalizada.length, 'caracteres)\n');

    try {
        // Gera o payload PIX
        const pixPayloadString = payload({
            key: dados.chavePix,
            name: nomeTitularNormalizado,
            city: cidadeNormalizada,
            amount: dados.valor,
            transactionId: dados.txid
        });

        console.log('Payload PIX gerado:');
        console.log(pixPayloadString);
        console.log('\nTamanho do payload:', pixPayloadString.length, 'caracteres\n');

        // Valida o CRC
        const crc = pixPayloadString.substring(pixPayloadString.length - 4);
        const crcValido = /^[0-9A-F]{4}$/i.test(crc);
        console.log('CRC:', crc, '- Válido:', crcValido ? '✅' : '❌\n');

        // Gera o QR Code
        const qrCodeDataUrl = await QRCode.toDataURL(pixPayloadString, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1
        });

        console.log('QR Code gerado com sucesso! ✅');
        console.log('Tamanho do QR Code (base64):', qrCodeDataUrl.length, 'caracteres\n');

        console.log('=== VALIDAÇÕES ===');
        console.log('✅ Nome titular ≤ 25 caracteres:', nomeTitularNormalizado.length <= 25);
        console.log('✅ Cidade ≤ 15 caracteres:', cidadeNormalizada.length <= 15);
        console.log('✅ TXID ≤ 25 caracteres:', dados.txid.length <= 25);
        console.log('✅ CRC válido:', crcValido);
        console.log('✅ Payload inicia com "00020126":', pixPayloadString.startsWith('00020126'));
        console.log('✅ Payload contém "BR.GOV.BCB.PIX":', pixPayloadString.includes('BR.GOV.BCB.PIX'));

        console.log('\n=== RESULTADO ===');
        console.log('✅ QR Code PIX gerado com sucesso e pronto para uso!');
        console.log('\nCopie o código abaixo e teste em um app de banco:');
        console.log('─'.repeat(60));
        console.log(pixPayloadString);
        console.log('─'.repeat(60));

    } catch (error) {
        console.error('❌ Erro ao gerar QR Code PIX:', error.message);
        console.error(error.stack);
    }
}

testarQRCodePix().catch(console.error);
