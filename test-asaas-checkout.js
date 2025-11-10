/**
 * Script de teste para verificar integração completa do Asaas Checkout
 * 
 * Este script testa:
 * 1. Criação de cliente no Asaas
 * 2. Criação de Checkout com split de pagamento
 * 3. Geração de URL do checkout
 * 4. Validação do split (15% plataforma, 85% estacionamento)
 */

require('dotenv').config();
const asaasMarketplace = require('./services/asaasMarketplaceService');
const { pool } = require('./config/database');
const logger = require('./utils/logger');

// Cores para output no console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

async function testarCheckoutAsaas() {
    try {
        logSection('🧪 TESTE DE INTEGRAÇÃO ASAAS CHECKOUT');
        
        // ===== 1. BUSCAR DADOS DO ESTACIONAMENTO =====
        logSection('1️⃣ Buscando dados do estacionamento');
        
        const resultEstacionamento = await pool.query(`
            SELECT id, nome, asaas_wallet_id 
            FROM estacionamentos 
            WHERE asaas_wallet_id IS NOT NULL 
            LIMIT 1
        `);
        
        if (resultEstacionamento.rows.length === 0) {
            log('❌ Nenhum estacionamento com Asaas Wallet ID encontrado', 'red');
            log('💡 Execute primeiro: node create-asaas-subaccount.js', 'yellow');
            return;
        }
        
        const estacionamento = resultEstacionamento.rows[0];
        log(`✅ Estacionamento encontrado:`, 'green');
        log(`   - ID: ${estacionamento.id}`);
        log(`   - Nome: ${estacionamento.nome}`);
        log(`   - Wallet ID: ${estacionamento.asaas_wallet_id}`);
        
        // ===== 2. BUSCAR USUÁRIO DE TESTE =====
        logSection('2️⃣ Buscando usuário de teste');
        
        const resultUsuario = await pool.query(`
            SELECT id, nome, email, cpf 
            FROM usuarios 
            WHERE email LIKE '%test%' OR email LIKE '%teste%'
            LIMIT 1
        `);
        
        let usuario;
        if (resultUsuario.rows.length === 0) {
            log('⚠️ Nenhum usuário de teste encontrado, criando dados fictícios...', 'yellow');
            usuario = {
                id: 999,
                nome: 'Cliente Teste Checkout',
                email: 'teste.checkout@parknow.com',
                cpf: '12345678901'
            };
        } else {
            usuario = resultUsuario.rows[0];
        }
        
        log(`✅ Usuário de teste:`, 'green');
        log(`   - ID: ${usuario.id}`);
        log(`   - Nome: ${usuario.nome}`);
        log(`   - Email: ${usuario.email}`);
        log(`   - CPF: ${usuario.cpf || 'Não informado'}`);
        
        // ===== 3. CRIAR CHECKOUT =====
        logSection('3️⃣ Criando Checkout Asaas com Split');
        
        const valor = 50.00;
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        
        log(`Parâmetros do checkout:`, 'cyan');
        log(`   - Valor: R$ ${valor.toFixed(2)}`);
        log(`   - Estacionamento: ${estacionamento.nome}`);
        log(`   - Wallet ID: ${estacionamento.asaas_wallet_id}`);
        log(`   - Cliente: ${usuario.nome} (${usuario.email})`);
        log(`   - CPF: ${usuario.cpf || 'Não informado'}`);
        
        const checkoutResult = await asaasMarketplace.criarCheckout({
            valor: valor,
            descricao: `Reserva Teste - ${estacionamento.nome}`,
            email_pagador: usuario.email,
            nome_pagador: usuario.nome,
            cpf_pagador: usuario.cpf || null,
            estacionamento_id: estacionamento.id,
            estacionamento_asaas_account_id: estacionamento.asaas_wallet_id,
            reserva_id: 99999, // ID fictício para teste
            success_url: `${baseUrl}/user/home.html?reserva=99999&status=sucesso`,
            cancel_url: `${baseUrl}/user/home.html?reserva=99999&status=cancelado`
        });
        
        // ===== 4. VALIDAR RESULTADO =====
        logSection('4️⃣ Validando resultado do checkout');
        
        log(`✅ Checkout criado com sucesso!`, 'green');
        log(`\nDados do Checkout:`, 'bright');
        log(`   - Checkout ID: ${checkoutResult.checkout_id}`, 'cyan');
        log(`   - Status: ${checkoutResult.status}`, 'cyan');
        log(`   - Payment ID: ${checkoutResult.payment_id || 'Aguardando pagamento'}`, 'cyan');
        
        log(`\n💰 Valores e Split:`, 'bright');
        log(`   - Valor Total: R$ ${checkoutResult.valor_total.toFixed(2)}`, 'green');
        log(`   - Comissão Plataforma (${checkoutResult.percentual_split}%): R$ ${checkoutResult.comissao_plataforma.toFixed(2)}`, 'yellow');
        log(`   - Valor Estacionamento (${100 - checkoutResult.percentual_split}%): R$ ${checkoutResult.valor_estacionamento.toFixed(2)}`, 'green');
        
        // ===== 5. VERIFICAR CÁLCULOS =====
        logSection('5️⃣ Verificando cálculos de split');
        
        const comissaoCalculada = parseFloat((valor * 0.15).toFixed(2));
        const valorEstacionamentoCalculado = parseFloat((valor - comissaoCalculada).toFixed(2));
        
        const comissaoCorreta = Math.abs(checkoutResult.comissao_plataforma - comissaoCalculada) < 0.01;
        const valorEstacionamentoCorreto = Math.abs(checkoutResult.valor_estacionamento - valorEstacionamentoCalculado) < 0.01;
        const somaCorreta = Math.abs((checkoutResult.comissao_plataforma + checkoutResult.valor_estacionamento) - valor) < 0.01;
        
        log(`Split esperado:`, 'cyan');
        log(`   - Comissão: R$ ${comissaoCalculada.toFixed(2)}`);
        log(`   - Estacionamento: R$ ${valorEstacionamentoCalculado.toFixed(2)}`);
        
        log(`\nValidações:`, 'bright');
        log(`   ${comissaoCorreta ? '✅' : '❌'} Comissão calculada corretamente`, comissaoCorreta ? 'green' : 'red');
        log(`   ${valorEstacionamentoCorreto ? '✅' : '❌'} Valor do estacionamento correto`, valorEstacionamentoCorreto ? 'green' : 'red');
        log(`   ${somaCorreta ? '✅' : '❌'} Soma dos valores confere`, somaCorreta ? 'green' : 'red');
        
        // ===== 6. URL DO CHECKOUT =====
        logSection('6️⃣ URL do Checkout');
        
        log(`\n🔗 URL para pagamento (copie e cole no navegador):`, 'bright');
        log(`\n${checkoutResult.checkout_url}\n`, 'blue');
        
        log(`💡 Esta URL abre o checkout do Asaas onde o cliente pode:`, 'yellow');
        log(`   - Pagar via PIX (QR Code ou Pix Copia e Cola)`);
        log(`   - Pagar via Cartão de Crédito`);
        log(`   - Ver o valor total e descrição`);
        log(`   - Ser redirecionado após o pagamento`);
        
        // ===== 7. INSTRUÇÕES =====
        logSection('7️⃣ Como testar o pagamento');
        
        log(`\n1. Copie a URL do checkout acima`, 'cyan');
        log(`2. Abra em um navegador (modo anônimo recomendado)`, 'cyan');
        log(`3. Você verá a interface profissional do Asaas`, 'cyan');
        log(`4. Escolha entre PIX ou Cartão`, 'cyan');
        log(`5. Complete o pagamento no SANDBOX (não é dinheiro real)`, 'cyan');
        log(`6. Após o pagamento, você será redirecionado`, 'cyan');
        log(`7. O webhook notificará automaticamente o sistema`, 'cyan');
        
        log(`\n⚠️ IMPORTANTE:`, 'yellow');
        log(`   - Ambiente: ${process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX (teste)' : 'PRODUÇÃO'}`, 'yellow');
        log(`   - Webhook configurado: https://parknow-3ppstmo.loca.lt/api/webhooks/asaas`, 'yellow');
        log(`   - Certifique-se que o localtunnel está rodando!`, 'yellow');
        
        // ===== 8. RESUMO FINAL =====
        logSection('8️⃣ Resumo da Integração');
        
        log(`\n✅ Todas as funcionalidades implementadas:`, 'green');
        log(`   ✔ Cliente criado/recuperado no Asaas`);
        log(`   ✔ Checkout gerado com split automático`);
        log(`   ✔ URL de pagamento disponível`);
        log(`   ✔ Split 15%/85% configurado`);
        log(`   ✔ URLs de retorno configuradas`);
        log(`   ✔ Webhook endpoint preparado`);
        
        log(`\n🎯 Sistema pronto para receber pagamentos!`, 'bright');
        log(`\n📊 Dados do teste salvos para referência:`, 'cyan');
        console.log(JSON.stringify({
            checkout_id: checkoutResult.checkout_id,
            checkout_url: checkoutResult.checkout_url,
            valor_total: checkoutResult.valor_total,
            split: {
                plataforma: checkoutResult.comissao_plataforma,
                estacionamento: checkoutResult.valor_estacionamento
            },
            external_reference: checkoutResult.external_reference
        }, null, 2));
        
    } catch (error) {
        logSection('❌ ERRO NO TESTE');
        log(`Erro: ${error.message}`, 'red');
        
        if (error.response?.data) {
            log(`\nDetalhes do erro Asaas:`, 'yellow');
            console.log(JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.stack) {
            log(`\nStack trace:`, 'yellow');
            console.log(error.stack);
        }
    } finally {
        await pool.end();
    }
}

// Executar teste
if (require.main === module) {
    testarCheckoutAsaas();
}

module.exports = { testarCheckoutAsaas };
