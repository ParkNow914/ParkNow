#!/usr/bin/env node

const localtunnel = require('localtunnel');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function perguntar(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function criarTunnelPersonalizado() {
  try {
    console.log('🚀 Configurando túnel LocalTunnel para ParkNow\n');

    // Perguntar pela porta
    const porta = await perguntar('📡 Qual porta usar? (padrão: 3000): ');
    const port = parseInt(porta) || 3000;

    // Perguntar pelo subdomain
    const subdomain = await perguntar('🌐 Qual subdomain usar? (ex: parknow-tunnel): ');
    const subdomainFinal = subdomain || 'parknow-tunnel';

    console.log('\n⏳ Criando túnel...');
    console.log(`📍 Porta local: ${port}`);
    console.log(`🌐 Subdomain: ${subdomainFinal}`);

    // Criar túnel
    const tunnel = await localtunnel({
      port: port,
      subdomain: subdomainFinal
    });

    console.log('\n✅ Túnel criado com sucesso!');
    console.log('='.repeat(50));
    console.log('🌐 URL DO SEU DOMÍNIO:', tunnel.url);
    console.log('='.repeat(50));
    console.log('📋 Use esta URL para:');
    console.log('   • Configurar webhooks no ASAAS');
    console.log('   • Testar a aplicação externamente');
    console.log('   • Compartilhar com outros desenvolvedores');
    console.log('\n⏳ Túnel está ativo. Pressione Ctrl+C para parar.');

    tunnel.on('close', () => {
      console.log('\n❌ Túnel fechado');
      rl.close();
    });

    tunnel.on('error', (err) => {
      console.error('\n❌ Erro no túnel:', err.message);
      rl.close();
    });

    // Manter o processo rodando
    process.on('SIGINT', () => {
      console.log('\n🛑 Encerrando túnel...');
      tunnel.close();
      rl.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Erro ao criar túnel:', error.message);

    if (error.message.includes('subdomain')) {
      console.log('\n💡 O subdomain pode já estar em uso. Tente outro nome.');
    } else if (error.message.includes('port')) {
      console.log('\n💡 Verifique se a porta está correta e livre.');
    }

    console.log('\n🔄 Tentando novamente em 3 segundos...');
    setTimeout(() => {
      criarTunnelPersonalizado();
    }, 3000);
  }
}

console.log('🏠 ParkNow - Criador de Domínio LocalTunnel');
console.log('💡 Alternativa gratuita ao ngrok\n');

criarTunnelPersonalizado();