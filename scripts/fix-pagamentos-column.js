const { Pool } = require('pg');
require('dotenv').config();

// Configuração do pool de conexões
const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: process.env.PG_DATABASE || 'parknow_db',
    max: 1,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

async function fixPagamentosColumn() {
    const client = await pool.connect();
    try {
        console.log('Verificando a estrutura da tabela pagamentos...');
        
        // Inicia uma transação
        await client.query('BEGIN');
        
        // Verifica se a tabela existe
        const tableExists = await client.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'pagamentos'
            )`
        );
        
        if (!tableExists.rows[0].exists) {
            console.log('A tabela pagamentos não existe. Criando...');
            await client.query(`
                CREATE TABLE pagamentos (
                    id SERIAL PRIMARY KEY,
                    reserva_id INTEGER NOT NULL,
                    metodo_pagamento VARCHAR(20) NOT NULL,
                    valor DECIMAL(10, 2) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    dados_adicionais JSONB,
                    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    data_pagamento TIMESTAMP WITH TIME ZONE,
                    data_vencimento TIMESTAMP WITH TIME ZONE,
                    codigo_barras VARCHAR(54),
                    codigo_pix TEXT,
                    qr_code TEXT,
                    
                    -- Chave estrangeira para a tabela de reservas
                    CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
                    
                    -- Restrições
                    CONSTRAINT check_metodo_valido CHECK (
                        metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro')
                    ),
                    
                    CONSTRAINT check_status_valido CHECK (
                        status IN ('pendente', 'aprovado', 'recusado', 'reembolsado', 'estornado', 'cancelado')
                    ),
                    
                    CONSTRAINT check_valor_positivo CHECK (
                        valor > 0
                    )
                );
                
                -- Índices para melhorar desempenho de consultas comuns
                CREATE INDEX idx_pagamentos_reserva_id ON pagamentos(reserva_id);
                CREATE INDEX idx_pagamentos_status ON pagamentos(status);
                CREATE INDEX idx_pagamentos_data_criacao ON pagamentos(data_criacao);
            `);
            console.log('Tabela pagamentos criada com sucesso!');
        } else {
            // Verifica se a coluna reserva_id existe
            const reservaIdExists = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'pagamentos' 
                    AND column_name = 'reserva_id'
                )`
            );

            // Verifica se a coluna id_reserva existe
            const idReservaExists = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'pagamentos' 
                    AND column_name = 'id_reserva'
                )`
            );

            if (idReservaExists.rows[0].exists) {
                if (reservaIdExists.rows[0].exists) {
                    console.log('Ambas as colunas id_reserva e reserva_id existem. Removendo id_reserva...');
                    // Primeiro, precisamos remover a chave estrangeira se existir
                    try {
                        await client.query(`
                            ALTER TABLE pagamentos 
                            DROP CONSTRAINT IF EXISTS fk_pagamentos_reserva;
                        `);
                        
                        // Depois remove a coluna
                        await client.query(`
                            ALTER TABLE pagamentos 
                            DROP COLUMN id_reserva;
                        `);
                        console.log('Coluna id_reserva removida com sucesso!');
                    } catch (err) {
                        console.warn('Aviso ao remover id_reserva:', err.message);
                    }
                } else {
                    console.log('Renomeando coluna id_reserva para reserva_id...');
                    await client.query(`
                        ALTER TABLE pagamentos 
                        RENAME COLUMN id_reserva TO reserva_id;
                        
                        -- Garante que a restrição de chave estrangeira existe
                        ALTER TABLE pagamentos 
                        ADD CONSTRAINT IF NOT EXISTS fk_reserva 
                        FOREIGN KEY (reserva_id) 
                        REFERENCES reservas(id) 
                        ON DELETE CASCADE;
                    `);
                    console.log('Coluna renomeada para reserva_id com sucesso!');
                }
            } else if (!reservaIdExists.rows[0].exists) {
                console.log('Adicionando coluna reserva_id...');
                // Primeiro adiciona a coluna como nullable
                await client.query(`
                    ALTER TABLE pagamentos 
                    ADD COLUMN reserva_id INTEGER;
                `);
                
                // Atualiza os valores existentes (você precisará definir um valor padrão ou lógica apropriada)
                // Neste exemplo, estou usando um valor arbitrário, mas você deve ajustar conforme necessário
                await client.query(`
                    UPDATE pagamentos 
                    SET reserva_id = (SELECT id FROM reservas LIMIT 1)
                    WHERE reserva_id IS NULL;
                `);
                
                // Agora altera para NOT NULL
                await client.query(`
                    ALTER TABLE pagamentos 
                    ALTER COLUMN reserva_id SET NOT NULL;
                `);
                
                // Adiciona a chave estrangeira
                await client.query(`
                    ALTER TABLE pagamentos 
                    ADD CONSTRAINT fk_reserva 
                    FOREIGN KEY (reserva_id) 
                    REFERENCES reservas(id) 
                    ON DELETE CASCADE;
                `);
                console.log('Coluna reserva_id adicionada com sucesso!');
            } else {
                console.log('A coluna reserva_id já existe e está correta.');
            }

            // Verifica se a coluna metodo_pagamento existe (foi renomeada de metodo)
            const metodoPagamentoExists = await client.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_schema = 'public' 
                    AND table_name = 'pagamentos' 
                    AND column_name = 'metodo_pagamento'
                )`
            );

            if (!metodoPagamentoExists.rows[0].exists) {
                console.log('Verificando se a coluna metodo existe para renomear...');
                const metodoExists = await client.query(
                    `SELECT EXISTS (
                        SELECT FROM information_schema.columns 
                        WHERE table_schema = 'public' 
                        AND table_name = 'pagamentos' 
                        AND column_name = 'metodo'
                    )`
                );

                if (metodoExists.rows[0].exists) {
                    console.log('Renomeando coluna metodo para metodo_pagamento...');
                    await client.query(`
                        ALTER TABLE pagamentos 
                        RENAME COLUMN metodo TO metodo_pagamento;
                    `);
                    console.log('Coluna metodo renomeada para metodo_pagamento com sucesso!');
                } else {
                    console.log('Adicionando coluna metodo_pagamento...');
                    await client.query(`
                        ALTER TABLE pagamentos 
                        ADD COLUMN metodo_pagamento VARCHAR(20) NOT NULL DEFAULT 'pix'
                        CONSTRAINT check_metodo_valido 
                        CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro'));
                    `);
                    console.log('Coluna metodo_pagamento adicionada com sucesso!');
                }
            }
        }
        
        // Confirma a transação
        await client.query('COMMIT');
        console.log('Verificação concluída com sucesso!');
        
    } catch (error) {
        // Em caso de erro, faz rollback
        await client.query('ROLLBACK');
        console.error('Erro durante a verificação:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

fixPagamentosColumn()
    .then(() => {
        console.log('Script de correção finalizado.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro ao executar correção:', err);
        process.exit(1);
    });
