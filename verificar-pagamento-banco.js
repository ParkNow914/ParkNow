require('dotenv').config();
const { pool } = require('./config/database');

async function verificarPagamentoAtualizado() {
  try {
    console.log('🔍 Verificando se o pagamento foi atualizado...');

    // Buscar o pagamento específico
    const result = await pool.query(
      'SELECT * FROM pagamentos WHERE id = (SELECT MAX(id) FROM pagamentos)',
      []
    );

    if (result.rows.length > 0) {
      const pagamento = result.rows[0];
      console.log('📊 Último pagamento no banco:');
      console.log(`ID: ${pagamento.id}`);
      console.log(`Status: ${pagamento.status}`);
      console.log(`Valor: R$ ${pagamento.valor}`);
      console.log(`Método: ${pagamento.metodo}`);
      console.log(`Dados retorno: ${JSON.stringify(pagamento.dados_retorno, null, 2)}`);
      console.log(`Criado em: ${pagamento.created_at}`);
      console.log(`Atualizado em: ${pagamento.updated_at}`);
    } else {
      console.log('❌ Nenhum pagamento encontrado');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar pagamento:', error.message);
  } finally {
    await pool.end();
  }
}

verificarPagamentoAtualizado();