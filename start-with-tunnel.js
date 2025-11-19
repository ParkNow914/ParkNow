#!/usr/bin/env node

const { spawn } = require('child_process');
const localtunnel = require('localtunnel');

async function iniciarServidorComTunnel() {
  console.log('🚀 Iniciando ParkNow com túnel LocalTunnel...\n');

  try {
    // 1. Criar túnel primeiro
    console.log('⏳ Criando túnel...');
    const tunnel = await localtunnel({
      port: 3000,
      subdomain: 'parknow-tunnel'
    });

    console.log('✅ Túnel criado!');
    console.log('🌐 URL:', tunnel.url);
    console.log('');

    // 2. Iniciar servidor
    console.log('⏳ Iniciando servidor...');
    const serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      shell: true
    });

    console.log('✅ Servidor iniciado!');
    console.log('📡 Porta local: 3000');
    console.log('');

    // 3. Informações finais
    console.log('='.repeat(60));
    console.log('🎉 ParkNow está rodando com túnel ativo!');
    console.log('🌐 URL Pública:', tunnel.url);
    console.log('🏠 URL Local: http://localhost:3000');
    console.log('='.repeat(60));
    console.log('');
    console.log('📋 Para configurar webhook no ASAAS:');
    console.log(`   URL: ${tunnel.url}/api/webhooks/asaas`);
    console.log('   Eventos: PAYMENT_RECEIVED, PAYMENT_CONFIRMED');
    console.log('');
    console.log('🛑 Pressione Ctrl+C para parar servidor e túnel');

    // Manter processos ativos
    process.on('SIGINT', () => {
      console.log('\n🛑 Encerrando servidor e túnel...');
      serverProcess.kill('SIGINT');
      tunnel.close();
      process.exit(0);
    });

    tunnel.on('close', () => {
      console.log('❌ Túnel fechado');
      serverProcess.kill('SIGINT');
    });

    tunnel.on('error', (err) => {
      console.error('❌ Erro no túnel:', err.message);
      serverProcess.kill('SIGINT');
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar:', error.message);
    console.log('\n💡 Dicas:');
    console.log('1. Verifique se a porta 3000 está livre');
    console.log('2. Execute apenas o túnel: npm run tunnel-local');
    console.log('3. Execute apenas o servidor: npm run dev');
  }
}

iniciarServidorComTunnel();