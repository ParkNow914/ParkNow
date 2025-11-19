#!/usr/bin/env node

const localtunnel = require('localtunnel');

async function criarTunnel() {
  try {
    console.log('🚀 Criando túnel com LocalTunnel...');

    // Criar túnel para a porta 3000 (onde o servidor está rodando)
    const tunnel = await localtunnel({
      port: 3000,
      subdomain: 'parknow-tunnel' // Você pode escolher um subdomain personalizado
    });

    console.log('✅ Túnel criado com sucesso!');
    console.log('🌐 URL do túnel:', tunnel.url);
    console.log('📡 Porta local:', 3000);
    console.log('🔗 Use esta URL para configurar webhooks no ASAAS');

    // Manter o túnel ativo
    console.log('\n⏳ Túnel está ativo. Pressione Ctrl+C para parar.');

    tunnel.on('close', () => {
      console.log('❌ Túnel fechado');
    });

    tunnel.on('error', (err) => {
      console.error('❌ Erro no túnel:', err.message);
    });

    // Manter o processo rodando
    process.on('SIGINT', () => {
      console.log('\n🛑 Encerrando túnel...');
      tunnel.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Erro ao criar túnel:', error.message);
    console.log('\n💡 Dicas:');
    console.log('1. Verifique se a porta 3000 está livre');
    console.log('2. Tente um subdomain diferente');
    console.log('3. Execute: npm run tunnel-local');
  }
}

criarTunnel();