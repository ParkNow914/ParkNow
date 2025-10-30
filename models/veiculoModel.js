const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Busca todos os veículos de um usuário
 */
const findVeiculosByUsuarioId = async (usuarioId) => {
    const sql = `
        SELECT id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao
        FROM veiculos 
        WHERE usuario_id = $1 
        ORDER BY padrao DESC, data_cadastro ASC
    `;
    
    try {
        const { rows } = await pool.query(sql, [usuarioId]);
        return rows;
    } catch (error) {
        logger.error(`Erro ao buscar veículos do usuário ${usuarioId}:`, error);
        throw error;
    }
};

/**
 * Busca um veículo específico
 */
const findVeiculoById = async (id, usuarioId) => {
    const sql = `
        SELECT id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao
        FROM veiculos 
        WHERE id = $1 AND usuario_id = $2
    `;
    
    try {
        const { rows } = await pool.query(sql, [id, usuarioId]);
        return rows[0] || null;
    } catch (error) {
        logger.error(`Erro ao buscar veículo ${id} do usuário ${usuarioId}:`, error);
        throw error;
    }
};

/**
 * Adiciona um novo veículo
 */
const createVeiculo = async (usuarioId, { tipo_veiculo, placa_veiculo, padrao = false }) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Se for marcar como padrão, primeiro remove o padrão atual
        if (padrao) {
            await client.query(
                'UPDATE veiculos SET padrao = FALSE WHERE usuario_id = $1 AND padrao = TRUE', 
                [usuarioId]
            );
        }
        
        // Insere o novo veículo
        const insertSql = `
            INSERT INTO veiculos (usuario_id, tipo_veiculo, placa_veiculo, padrao)
            VALUES ($1, $2, $3, $4)
            RETURNING id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao
        `;
        
        const { rows } = await client.query(insertSql, [
            usuarioId,
            tipo_veiculo,
            placa_veiculo.toUpperCase(),
            padrao || false
        ]);
        
        await client.query('COMMIT');
        return rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao criar veículo:', { usuarioId, tipo_veiculo, placa_veiculo, error });
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Atualiza um veículo existente
 */
const updateVeiculo = async (id, usuarioId, { tipo_veiculo, placa_veiculo, padrao }) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Se for marcar como padrão, primeiro remove o padrão atual
        if (padrao) {
            await client.query(
                'UPDATE veiculos SET padrao = FALSE WHERE usuario_id = $1 AND id != $2 AND padrao = TRUE', 
                [usuarioId, id]
            );
        }
        
        // Atualiza o veículo
        const updateFields = [];
        const values = [];
        let paramIndex = 1;
        
        if (tipo_veiculo !== undefined) {
            updateFields.push(`tipo_veiculo = $${paramIndex++}`);
            values.push(tipo_veiculo);
        }
        
        if (placa_veiculo !== undefined) {
            updateFields.push(`placa_veiculo = $${paramIndex++}`);
            values.push(placa_veiculo.toUpperCase());
        }
        
        if (padrao !== undefined) {
            updateFields.push(`padrao = $${paramIndex++}`);
            values.push(padrao);
        }
        
        // Adiciona data de atualização
        updateFields.push(`data_atualizacao = NOW()`);
        
        // Adiciona WHERE
        values.push(id);
        values.push(usuarioId);
        
        const updateSql = `
            UPDATE veiculos 
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex} AND usuario_id = $${paramIndex + 1}
            RETURNING id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao
        `;
        
        const { rows } = await client.query(updateSql, values);
        
        if (rows.length === 0) {
            throw new Error('Veículo não encontrado ou não pertence ao usuário');
        }
        
        await client.query('COMMIT');
        return rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao atualizar veículo:', { id, usuarioId, error });
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Remove um veículo
 */
const deleteVeiculo = async (id, usuarioId) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Verifica se é o veículo padrão
        const checkSql = 'SELECT padrao FROM veiculos WHERE id = $1 AND usuario_id = $2';
        const checkResult = await client.query(checkSql, [id, usuarioId]);
        
        if (checkResult.rows.length === 0) {
            throw new Error('Veículo não encontrado ou não pertence ao usuário');
        }
        
        const isPadrao = checkResult.rows[0].padrao;
        
        // Remove o veículo
        const deleteSql = 'DELETE FROM veiculos WHERE id = $1 AND usuario_id = $2 RETURNING id';
        const deleteResult = await client.query(deleteSql, [id, usuarioId]);
        
        if (deleteResult.rows.length === 0) {
            throw new Error('Falha ao remover veículo');
        }
        
        // Se era o veículo padrão, define outro como padrão (se existir)
        if (isPadrao) {
            const updateSql = `
                UPDATE veiculos 
                SET padrao = TRUE, data_atualizacao = NOW()
                WHERE usuario_id = $1 AND id != $2
                AND id = (SELECT id FROM veiculos WHERE usuario_id = $1 AND id != $2 LIMIT 1)
                RETURNING id
            `;
            
            await client.query(updateSql, [usuarioId, id]);
        }
        
        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao remover veículo:', { id, usuarioId, error });
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Define um veículo como padrão
 */
const setVeiculoPadrao = async (id, usuarioId) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Remove o padrão atual
        await client.query(
            'UPDATE veiculos SET padrao = FALSE, data_atualizacao = NOW() WHERE usuario_id = $1 AND padrao = TRUE', 
            [usuarioId]
        );
        
        // Define o novo veículo como padrão
        const updateSql = `
            UPDATE veiculos 
            SET padrao = TRUE, data_atualizacao = NOW()
            WHERE id = $1 AND usuario_id = $2
            RETURNING id, tipo_veiculo, placa_veiculo, padrao
        `;
        
        const { rows } = await client.query(updateSql, [id, usuarioId]);
        
        if (rows.length === 0) {
            throw new Error('Veículo não encontrado ou não pertence ao usuário');
        }
        
        await client.query('COMMIT');
        return rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Erro ao definir veículo como padrão:', { id, usuarioId, error });
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    findVeiculosByUsuarioId,
    findVeiculoById,
    createVeiculo,
    updateVeiculo,
    deleteVeiculo,
    setVeiculoPadrao
};
