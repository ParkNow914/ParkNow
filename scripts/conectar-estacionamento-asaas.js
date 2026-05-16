/**
 * Script para conectar um estacionamento ao ASAAS
 * 
 * Uso: node scripts/conectar-estacionamento-asaas.js <estacionamento_id>
 * Exemplo: node scripts/conectar-estacionamento-asaas.js 1
 */

require('dotenv').config();
const db = require('../config/db');
const asaasMarketplaceService = require('../services/asaasMarketplaceService');
const _logger = require('../utils/logger');

async function conectarEstacionamentoAsaas(estacionamentoId) {
    try {
        console.log('\n========================================');
        console.log('CONECTAR ESTACIONAMENTO AO ASAAS');
        console.log('========================================\n');

        // 1. Buscar dados do estacionamento
        console.log(`📍 Buscando estacionamento ID ${estacionamentoId}...`);
        
        const queryEstacionamento = `
            SELECT 
                e.id, 
                e.nome, 
                e.admin_id,
                e.asaas_wallet_id,
                e.asaas_connected_at,
                a.nome as admin_nome,
                a.email as admin_email,
                a.cnpj as admin_cnpj,
                a.telefone as admin_telefone
            FROM estacionamentos e
            INNER JOIN admins a ON e.admin_id = a.id
            WHERE e.id = $1
        `;

        const { rows } = await db.query(queryEstacionamento, [estacionamentoId]);

        if (rows.length === 0) {
            console.error('❌ Estacionamento não encontrado!');
            process.exit(1);
        }

        const estacionamento = rows[0];
        
        console.log('✅ Estacionamento encontrado:');
        console.log(`   Nome: ${estacionamento.nome}`);
        console.log(`   Admin: ${estacionamento.admin_nome} (${estacionamento.admin_email})`);
        console.log(`   CPF/CNPJ: ${estacionamento.admin_cnpj || 'NÃO CADASTRADO'}`);
        console.log('');

        // 2. Verificar se já está conectado
        if (estacionamento.asaas_wallet_id) {
            console.log('⚠️  Estacionamento JÁ ESTÁ CONECTADO ao ASAAS:');
            console.log(`   Wallet ID: ${estacionamento.asaas_wallet_id}`);
            console.log(`   Conectado em: ${estacionamento.asaas_connected_at}`);
            console.log('');
            
            const resposta = await perguntarReconectar();
            if (!resposta) {
                console.log('❌ Operação cancelada pelo usuário.');
                process.exit(0);
            }
        }

        // 3. Verificar dados obrigatórios
        if (!estacionamento.admin_email) {
            console.error('❌ Admin sem email cadastrado!');
            process.exit(1);
        }

        if (!estacionamento.admin_cnpj) {
            console.error('❌ Admin sem CPF/CNPJ cadastrado!');
            console.error('   Por favor, atualize o cadastro do administrador antes de conectar ao ASAAS.');
            process.exit(1);
        }

        // 4. Criar subconta no ASAAS
        console.log('🔄 Criando subconta ASAAS...');
        console.log(`   Ambiente: ${process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'}`);
        console.log('');

        const subconta = await asaasMarketplaceService.criarSubconta({
            nome: estacionamento.nome,
            email: estacionamento.admin_email,
            cpfCnpj: estacionamento.admin_cnpj,
            telefone: estacionamento.admin_telefone || '11999999999'
        });

        if (!subconta.walletId) {
            console.error('❌ Erro: walletId não retornado pela API ASAAS!');
            console.log('Resposta:', JSON.stringify(subconta, null, 2));
            process.exit(1);
        }

        console.log('✅ Subconta ASAAS criada com sucesso!');
        console.log(`   Wallet ID: ${subconta.walletId}`);
        console.log('');

        // 5. Atualizar estacionamento no banco
        console.log('🔄 Atualizando estacionamento no banco de dados...');
        
        const queryUpdate = `
            UPDATE estacionamentos
            SET 
                asaas_wallet_id = $1,
                asaas_connected_at = NOW()
            WHERE id = $2
            RETURNING id, nome, asaas_wallet_id, asaas_connected_at
        `;

        const { rows: updated } = await db.query(queryUpdate, [subconta.walletId, estacionamentoId]);

        console.log('✅ Estacionamento atualizado com sucesso!');
        console.log('');
        
        // 6. Exibir resultado final
        console.log('========================================');
        console.log('✅ CONEXÃO CONCLUÍDA COM SUCESSO!');
        console.log('========================================');
        console.log(`Estacionamento: ${updated[0].nome}`);
        console.log(`Wallet ID: ${updated[0].asaas_wallet_id}`);
        console.log(`Conectado em: ${updated[0].asaas_connected_at}`);
        console.log(`Ambiente: ${process.env.ASAAS_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUÇÃO'}`);
        console.log('========================================\n');

        // 7. Testar criação de pagamento (opcional)
        console.log('💡 Para testar o pagamento, execute:');
        console.log(`   POST /api/reservas/com-pagamento`);
        console.log(`   Body: { estacionamento_id: ${estacionamentoId}, ... }`);
        console.log('');

    } catch (error) {
        console.error('');
        console.error('========================================');
        console.error('❌ ERRO AO CONECTAR ESTACIONAMENTO');
        console.error('========================================');
        console.error('Erro:', error.message);
        
        if (error.response?.data) {
            console.error('Detalhes da API ASAAS:');
            console.error(JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.stack) {
            console.error('');
            console.error('Stack trace:');
            console.error(error.stack);
        }
        
        console.error('========================================\n');
        process.exit(1);
    } finally {
        // Pool do dbUtils não tem método end(), ele gerencia as conexões automaticamente
        process.exit(0);
    }
}

// Função auxiliar para perguntar se quer reconectar
async function perguntarReconectar() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Deseja reconectar? Isso criará uma NOVA subconta ASAAS. (s/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim');
        });
    });
}

// Executar script
const estacionamentoId = process.argv[2];

if (!estacionamentoId) {
    console.error('❌ Uso: node scripts/conectar-estacionamento-asaas.js <estacionamento_id>');
    console.error('   Exemplo: node scripts/conectar-estacionamento-asaas.js 1');
    process.exit(1);
}

conectarEstacionamentoAsaas(parseInt(estacionamentoId, 10));
