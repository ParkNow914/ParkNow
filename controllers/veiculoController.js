const veiculoModel = require('../models/veiculoModel');
const { AppError, NotFoundError, BadRequestError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Obtém todos os veículos do usuário
 */
const getVeiculos = async (req, res, next) => {
    try {
        const veiculos = await veiculoModel.findVeiculosByUsuarioId(req.user.id);
        res.json(veiculos);
    } catch (error) {
        next(error);
    }
};

/**
 * Obtém um veículo específico
 */
const getVeiculo = async (req, res, next) => {
    try {
        const veiculo = await veiculoModel.findVeiculoById(req.params.id, req.user.id);
        if (!veiculo) {
            throw new NotFoundError('Veículo não encontrado');
        }
        res.json(veiculo);
    } catch (error) {
        next(error);
    }
};

/**
 * Adiciona um novo veículo
 */
const createVeiculo = async (req, res, next) => {
    try {
        const { tipo_veiculo, placa_veiculo, padrao } = req.body;
        
        // Validação básica
        if (!tipo_veiculo || !placa_veiculo) {
            throw new BadRequestError('Tipo e placa do veículo são obrigatórios');
        }
        
        // Valida formato da placa (aceita Mercosul e formato antigo)
        const placaRegex = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;
        if (!placaRegex.test(placa_veiculo.toUpperCase())) {
            throw new BadRequestError('Formato de placa inválido (use o formato AAA0A00 ou AAA0000)');
        }
        
        const veiculo = await veiculoModel.createVeiculo(
            req.user.id, 
            { 
                tipo_veiculo, 
                placa_veiculo, 
                padrao: !!padrao 
            }
        );
        
        res.status(201).json({
            success: true,
            message: 'Veículo adicionado com sucesso',
            data: veiculo
        });
    } catch (error) {
        if (error.code === '23505') { // Violação de chave única
            next(new BadRequestError('Já existe um veículo cadastrado com esta placa'));
        } else {
            next(error);
        }
    }
};

/**
 * Atualiza um veículo existente
 */
const updateVeiculo = async (req, res, next) => {
    try {
        const { tipo_veiculo, placa_veiculo, padrao } = req.body;
        const veiculoId = req.params.id;
        
        // Validação básica
        if (placa_veiculo) {
            const placaRegex = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;
            if (!placaRegex.test(placa_veiculo.toUpperCase())) {
                throw new BadRequestError('Formato de placa inválido (use o formato AAA0A00 ou AAA0000)');
            }
        }
        
        const updates = {};
        if (tipo_veiculo !== undefined) updates.tipo_veiculo = tipo_veiculo;
        if (placa_veiculo !== undefined) updates.placa_veiculo = placa_veiculo;
        if (padrao !== undefined) updates.padrao = padrao;
        
        // Se não houver nada para atualizar
        if (Object.keys(updates).length === 0) {
            throw new BadRequestError('Nenhum dado para atualizar');
        }
        
        const veiculo = await veiculoModel.updateVeiculo(veiculoId, req.user.id, updates);
        
        res.json({
            success: true,
            message: 'Veículo atualizado com sucesso',
            data: veiculo
        });
    } catch (error) {
        if (error.code === '23505') { // Violação de chave única
            next(new BadRequestError('Já existe um veículo cadastrado com esta placa'));
        } else if (error.message === 'Veículo não encontrado ou não pertence ao usuário') {
            next(new NotFoundError('Veículo não encontrado'));
        } else {
            next(error);
        }
    }
};

/**
 * Remove um veículo
 */
const deleteVeiculo = async (req, res, next) => {
    try {
        const veiculoId = req.params.id;
        
        await veiculoModel.deleteVeiculo(veiculoId, req.user.id);
        
        res.json({
            success: true,
            message: 'Veículo removido com sucesso'
        });
    } catch (error) {
        if (error.message === 'Veículo não encontrado ou não pertence ao usuário' ||
            error.message === 'Falha ao remover veículo') {
            next(new NotFoundError('Veículo não encontrado'));
        } else {
            next(error);
        }
    }
};

/**
 * Define um veículo como padrão
 */
const setVeiculoPadrao = async (req, res, next) => {
    try {
        const veiculoId = req.params.id;
        
        const veiculo = await veiculoModel.setVeiculoPadrao(veiculoId, req.user.id);
        
        res.json({
            success: true,
            message: 'Veículo definido como padrão',
            data: veiculo
        });
    } catch (error) {
        if (error.message === 'Veículo não encontrado ou não pertence ao usuário') {
            next(new NotFoundError('Veículo não encontrado'));
        } else {
            next(error);
        }
    }
};

module.exports = {
    getVeiculos,
    getVeiculo,
    createVeiculo,
    updateVeiculo,
    deleteVeiculo,
    setVeiculoPadrao
};
