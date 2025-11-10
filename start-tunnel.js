const localtunnel = require('localtunnel');

(async () => {
  console.log('\n========================================');
  console.log('  🚀 INICIANDO LOCALTUNNEL');
  console.log('========================================\n');
  console.log('📡 Expondo porta 3000...\n');

  try {
    const tunnel = await localtunnel({ 
      port: 3000,
      subdomain: 'parknow-' + Math.random().toString(36).substring(7)
    });

    const webhookUrl = `${tunnel.url}/api/webhooks/asaas`;

    console.log('✅ LOCALTUNNEL ATIVO!\n');
    console.log('🌐 URL Pública:');
    console.log(`   ${tunnel.url}`);
    console.log('\n📋 URL do Webhook para o Asaas:');
    console.log(`   ${webhookUrl}`);
    console.log('\n========================================');
    console.log('⚠️  MANTENHA ESTA JANELA ABERTA!');
    console.log('========================================\n');

    // Copiar para clipboard (Windows)
    const { exec } = require('child_process');
    exec(`echo ${webhookUrl} | clip`, (error) => {
      if (!error) {
        console.log('✅ URL copiada para área de transferência!\n');
      }
    });

    tunnel.on('close', () => {
      console.log('\n❌ Tunnel fechado');
      process.exit();
    });

    // Manter o processo ativo
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  Encerrando localtunnel...');
      tunnel.close();
      process.exit();
    });

  } catch (err) {
    console.error('❌ Erro ao iniciar localtunnel:', err.message);
    process.exit(1);
  }
})();
