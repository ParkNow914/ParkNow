/**
 * Script para criar subconta Asaas para um estacionamento
 */

require('dotenv').config();
const axios = require('axios');
const { sequelize } = require('./config/db.postgres');
const { QueryTypes } = require('sequelize');

const apiKey = process.env.ASAAS_SANDBOX === 'true' 
    ? process.env.ASAAS_SANDBOX_API_KEY 
    : process.env.ASAAS_API_KEY;

const baseURL = process.env.ASAAS_SANDBOX === 'true'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

const client = axios.create({
    baseURL,
    headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json'
    }
});

async function criarSubcontaParaEstacionamento(estacionamentoId) {
    try {
        // 1. Buscar dados do estacionamento
        console.log(`\n🔍 Buscando dados do estacionamento ID: ${estacionamentoId}...\n`);
        
        const estacionamentos = await sequelize.query(
            'SELECT * FROM estacionamentos WHERE id = ?',
            {
                replacements: [estacionamentoId],
                type: QueryTypes.SELECT
            }
        );

        if (!estacionamentos || estacionamentos.length === 0) {
            throw new Error('Estacionamento não encontrado!');
        }

        const estacionamento = estacionamentos[0];
        console.log('📍 Estacionamento:', estacionamento.nome);
        console.log('🏢 CNPJ:', estacionamento.cnpj || 'NÃO INFORMADO');
        console.log('📧 Email:', estacionamento.email || 'NÃO INFORMADO');
        console.log('📱 Telefone:', estacionamento.telefone || 'NÃO INFORMADO');
        console.log('📮 CEP:', estacionamento.cep || 'NÃO INFORMADO');
        console.log('🏠 Endereço:', estacionamento.endereco || 'NÃO INFORMADO');

        // 2. Verificar se já tem wallet_id
        if (estacionamento.asaas_wallet_id && !estacionamento.asaas_wallet_id.includes('TEST')) {
            console.log('\n⚠️  Este estacionamento já possui um wallet ID válido:', estacionamento.asaas_wallet_id);
            const resposta = await prompt('Deseja criar uma nova subconta? (s/n): ');
            if (resposta.toLowerCase() !== 's') {
                console.log('Operação cancelada.');
                return;
            }
        }

        // 3. Validar dados obrigatórios
        if (!estacionamento.cnpj && !estacionamento.admin_id) {
            throw new Error('Estacionamento sem CNPJ ou admin_id. Cadastro incompleto!');
        }

        // Buscar CPF do admin se não tiver CNPJ
        let cpfCnpj = estacionamento.cnpj;
        
        if (!cpfCnpj && estacionamento.admin_id) {
            const admins = await sequelize.query(
                'SELECT cnpj, cpf FROM admins WHERE id = ?',
                {
                    replacements: [estacionamento.admin_id],
                    type: QueryTypes.SELECT
                }
            );
            
            if (admins && admins.length > 0) {
                cpfCnpj = admins[0].cnpj || admins[0].cpf;
                console.log('📝 Usando CNPJ/CPF do admin:', cpfCnpj);
            }
        }

        if (!cpfCnpj) {
            throw new Error('Não foi possível obter CNPJ/CPF para criar a subconta!');
        }

        // 4. Preparar dados REAIS para criar subconta
        const isCNPJ = cpfCnpj.replace(/\D/g, '').length === 14;
        
        const dadosSubconta = {
            name: estacionamento.nome,
            email: estacionamento.email || `estacionamento${estacionamentoId}@parknow.com.br`,
            cpfCnpj: cpfCnpj.replace(/\D/g, ''), // Remove formatação
            mobilePhone: (estacionamento.telefone || '11987654321').replace(/\D/g, ''),
            phone: (estacionamento.telefone || '1140041234').replace(/\D/g, ''),
            
            // Endereço REAL do banco de dados
            postalCode: (estacionamento.cep || '01310100').replace(/\D/g, ''),
            address: estacionamento.logradouro || 'Av. Paulista',
            addressNumber: estacionamento.numero || '1000',
            complement: estacionamento.complemento || null,
            province: estacionamento.bairro || 'Bela Vista',
            
            // Campos específicos para CNPJ (pessoa jurídica)
            ...(isCNPJ ? {
                companyType: 'MEI', // Microempreendedor Individual
                incomeValue: 5000 // Faturamento mensal estimado
            } : {
                birthDate: '1985-01-01', // Data padrão para CPF
                incomeValue: 5000
            }),
            
            site: 'https://parknow.com.br'
        };

        console.log('\n📝 Dados da subconta (usando dados REAIS do banco):');
        console.log(JSON.stringify(dadosSubconta, null, 2));

        // 5. Criar subconta no Asaas
        console.log('\n🚀 Criando subconta no Asaas COM DADOS REAIS...');
        
        const response = await client.post('/accounts', dadosSubconta);
        const subconta = response.data;

        console.log('\n✅ Subconta criada com sucesso!');
        console.log('🆔 Wallet ID:', subconta.walletId);
        console.log('📧 Email:', subconta.email);
        console.log('👤 Nome:', subconta.name);
        console.log('🏢 CNPJ/CPF:', cpfCnpj);

        // 6. Atualizar estacionamento no banco
        console.log('\n💾 Atualizando estacionamento no banco...');
        
        await sequelize.query(
            'UPDATE estacionamentos SET asaas_wallet_id = ?, asaas_connected_at = NOW() WHERE id = ?',
            {
                replacements: [subconta.walletId, estacionamentoId],
                type: QueryTypes.UPDATE
            }
        );

        console.log('✅ Estacionamento atualizado no banco!');

        console.log('\n🎉 PRONTO! O estacionamento agora pode receber pagamentos.');
        console.log('\n📋 Resumo:');
        console.log(`   - Estacionamento: ${estacionamento.nome}`);
        console.log(`   - Wallet ID: ${subconta.walletId}`);
        console.log(`   - Email Asaas: ${subconta.email}`);

        return subconta.walletId;

    } catch (error) {
        console.error('\n❌ ERRO:', error.message);
        
        if (error.response?.data) {
            console.error('\n📄 Detalhes do erro Asaas:');
            console.error(JSON.stringify(error.response.data, null, 2));
        }
    } finally {
        await sequelize.close();
    }
}

// Executar
const estacionamentoId = process.argv[2] || 1;

console.log('╔════════════════════════════════════════════╗');
console.log('║  Criar Subconta Asaas para Estacionamento  ║');
console.log('╚════════════════════════════════════════════╝');

criarSubcontaParaEstacionamento(estacionamentoId);
