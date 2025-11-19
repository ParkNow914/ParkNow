require('dotenv').config();
const { Estacionamento } = require('./models');

async function verificarEstacionamento() {
  try {
    const estacionamento = await Estacionamento.findByPk(7);
    console.log('Estacionamento ID 7:');
    console.log('   - asaas_wallet_id:', estacionamento.asaas_wallet_id);
    console.log('   - asaas_connected_at:', estacionamento.asaas_connected_at);
    console.log('   - chave_pix:', estacionamento.chave_pix);
    console.log('   - tipo_chave_pix:', estacionamento.tipo_chave_pix);
    console.log('   - nome_titular_pix:', estacionamento.nome_titular_pix);
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    process.exit(0);
  }
}

verificarEstacionamento();