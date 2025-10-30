// controllers/userController.js
const userModel = require('../models/userModel');
const { AppError, NotFoundError, BadRequestError } = require('../utils/AppError');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configurações para a imagem de perfil
const PROFILE_IMAGE_SIZE = 300; // Tamanho padrão para imagens de perfil (300x300 pixels)

const getUserProfile = async (req, res, next) => {
    try {
        const user = await userModel.findUserById(req.user.id);
        if (!user) throw new NotFoundError('Usuário não encontrado.');
        res.json(user);
    } catch (error) { next(error); }
};

const updateUserProfile = async (req, res, next) => {
    const userId = req.user.id;
    try {
        // Busca dados atuais do usuário
        const currentUserData = await userModel.findUserById(userId);
        if (!currentUserData) throw new NotFoundError('Usuário não encontrado.');

        // Prepara objeto com dados atualizados, mantendo valores existentes caso não fornecidos
        const dataToUpdate = {
            nome: req.body.nome || currentUserData.nome,
            email: currentUserData.email, // Email não pode ser alterado
            telefone: req.body.telefone !== undefined ? req.body.telefone : currentUserData.telefone,
            tipo_veiculo: req.body.tipo_veiculo || currentUserData.tipo_veiculo,
            placa_veiculo: req.body.placa_veiculo ? req.body.placa_veiculo.toUpperCase() : currentUserData.placa_veiculo,
            cpf: req.body.cpf || currentUserData.cpf || null
        };

        // Impede alteração de email (regra de negócio)
        if (req.body.email && currentUserData.email !== req.body.email) {
            logger.warn(`[User Profile] Tentativa de mudar email bloqueada U:${userId}.`);
            return next(new BadRequestError("Alteração de email não permitida por esta rota."));
        }

        // Atualiza o usuário no banco de dados
        const updated = await userModel.updateUser(userId, dataToUpdate);

        // updateUser retorna true/false, mas pode lançar ER_DUP_ENTRY
        if (!updated && !(await userModel.findUserById(userId))) { // Checa se usuário ainda existe
            throw new NotFoundError('Usuário não encontrado após tentativa de update.');
        }
        
        // Se updated for false mas usuário existe, significa que nada mudou (304)
        if (!updated) return res.status(304).send();

        // Busca dados atualizados para retornar ao cliente
        const updatedUser = await userModel.findUserById(userId);
        logger.info(`Perfil atualizado U:${userId}`);
        res.json({ success: 'Dados atualizados!', user: updatedUser });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') next(new AppError('CPF já está em uso.', 409));
        else next(error);
    }
};
const uploadProfileImage = async (req, res, next) => {
    try {
        // Verificar se o arquivo foi enviado
        if (!req.file) {
            throw new BadRequestError('Nenhuma imagem foi enviada.');
        }

        // Verificar se o usuário está autenticado
        if (!req.user || !req.user.id) {
            throw new BadRequestError('Usuário não autenticado.');
        }

        const userId = req.user.id;
        const currentUserData = await userModel.findUserById(userId);
        if (!currentUserData) {
            throw new NotFoundError('Usuário não encontrado.');
        }

        // Criar o diretório de uploads se não existir
        const uploadDir = path.join(__dirname, '../public/user/img/profile');
        if (!fs.existsSync(uploadDir)) {
            try {
                fs.mkdirSync(uploadDir, { recursive: true });
                logger.info(`Diretório de uploads criado: ${uploadDir}`);
            } catch (err) {
                logger.error(`Erro ao criar diretório de uploads: ${err.message}`);
                throw new AppError('Erro ao criar diretório de uploads.', 500);
            }
        }

        // Se o usuário já tinha uma imagem, remover a antiga
        if (currentUserData.foto_perfil) {
            try {
                // Extrair o nome do arquivo da URL
                const oldImagePath = currentUserData.foto_perfil.split('/').pop();
                if (oldImagePath) {
                    const fullPath = path.join(__dirname, '../public/user/img/profile', oldImagePath);
                    
                    // Verificar se o arquivo existe antes de tentar excluir
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        logger.info(`Imagem antiga removida: ${oldImagePath}`);
                    }
                }
            } catch (err) {
                // Apenas logar o erro, não interromper o fluxo
                logger.warn(`Erro ao remover imagem antiga: ${err.message}`);
            }
        }

        // Gerar um nome único para a imagem processada
        const filename = `profile-${userId}-${Date.now()}.jpg`;
        const outputPath = path.join(uploadDir, filename);
        
        // Processar e redimensionar a imagem usando Sharp
        try {
            // Verificar se o arquivo existe antes de tentar processá-lo
            if (!fs.existsSync(req.file.path)) {
                throw new Error(`Arquivo de upload não encontrado: ${req.file.path}`);
            }
            
            console.log(`Processando imagem de: ${req.file.path} para: ${outputPath}`);
            
            // Gerar um nome de arquivo diferente para a imagem processada para evitar conflitos
            // Redimensionar a imagem para um quadrado de tamanho padrão
            await sharp(req.file.path)
                .rotate()               // Corrige automaticamente a rotação com base nos metadados EXIF
                .resize({
                    width: PROFILE_IMAGE_SIZE,
                    height: PROFILE_IMAGE_SIZE,
                    fit: 'cover',      // Corta a imagem para preencher o tamanho especificado
                    position: 'centre'  // Centraliza o corte
                })
                .withMetadata({ orientation: 1 })  // Normaliza a orientação
                .jpeg({ quality: 90 })  // Converte para JPEG com 90% de qualidade
                .toFile(outputPath);    // Salva no caminho de destino
                
            // Não vamos tentar remover o arquivo original para evitar erros de permissão
            // O sistema operacional ou o garbage collector cuidarão disso eventualmente
            console.log(`Imagem processada com sucesso: ${filename}`);
            
            // No Windows, às vezes há problemas de permissão ao tentar excluir arquivos recém-criados
            
            console.log(`Imagem processada e salva: ${filename}`);
        } catch (err) {
            console.error(`Erro detalhado ao processar imagem: ${err.message}`);
            console.error(err.stack);
            throw new AppError(`Erro ao processar a imagem: ${err.message}`, 500);
        }

        // Construir a URL da nova imagem (usando caminho relativo à raiz do site)
        const imageUrl = `/user/img/profile/${filename}`;

        // Atualizar o perfil do usuário com a nova URL da imagem
        const updated = await userModel.updateUser(userId, { foto_perfil: imageUrl });

        if (!updated) {
            // Se falhar ao atualizar o perfil, remover a imagem processada
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
                logger.info(`Imagem processada removida após falha na atualização do perfil: ${filename}`);
            }
            throw new AppError('Falha ao atualizar a imagem de perfil.', 500);
        }

        logger.info(`Imagem de perfil atualizada U:${userId}`);
        res.json({ 
            success: true, 
            message: 'Imagem de perfil atualizada com sucesso!',
            imageUrl: imageUrl
        });
    } catch (error) {
        // Não vamos tentar remover o arquivo original para evitar erros de permissão adicionais
        // Apenas registrar o erro para depuração
        
        // Melhorar a mensagem de erro para o cliente
        const errorMessage = error.message || 'Erro interno ao processar o upload da imagem';
        const statusCode = error.statusCode || 500;
        
        console.error(`Erro no upload de imagem: ${errorMessage}`);
        console.error(error.stack);
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
};

/**
 * Remove a foto de perfil do usuário
 */
const removeProfileImage = async (req, res, next) => {
    try {
        // Verificar se o usuário está autenticado
        if (!req.user || !req.user.id) {
            throw new BadRequestError('Usuário não autenticado.');
        }

        const userId = req.user.id;
        const currentUserData = await userModel.findUserById(userId);
        
        if (!currentUserData) {
            throw new NotFoundError('Usuário não encontrado.');
        }

        // Verificar se o usuário tem uma foto de perfil
        if (!currentUserData.foto_perfil) {
            return res.json({
                success: true,
                message: 'Usuário não possui foto de perfil.'
            });
        }

        // Tentativa de remover o arquivo físico, mas não é crítico se falhar
        try {
            // Extrair o nome do arquivo da URL
            const oldImagePath = currentUserData.foto_perfil.split('/').pop();
            if (oldImagePath) {
                const fullPath = path.join(__dirname, '../public/user/img/profile', oldImagePath);
                
                // Verificar se o arquivo existe antes de tentar excluir
                if (fs.existsSync(fullPath)) {
                    try {
                        // Tentar excluir o arquivo, mas não bloquear se falhar
                        fs.unlinkSync(fullPath);
                        console.log(`Imagem removida: ${oldImagePath}`);
                    } catch (unlinkErr) {
                        // Se falhar ao excluir, apenas registrar o erro
                        console.warn(`Não foi possível excluir o arquivo: ${unlinkErr.message}`);
                        // Programar uma tentativa de exclusão posterior
                        setTimeout(() => {
                            try {
                                if (fs.existsSync(fullPath)) {
                                    fs.unlinkSync(fullPath);
                                    console.log(`Imagem removida posteriormente: ${oldImagePath}`);
                                }
                            } catch (e) {
                                console.warn(`Falha na segunda tentativa de exclusão: ${e.message}`);
                            }
                        }, 1000); // Tentar novamente após 1 segundo
                    }
                }
            }
        } catch (err) {
            // Apenas logar o erro, não interromper o fluxo
            console.warn(`Erro ao processar remoção de imagem: ${err.message}`);
        }

        // Atualizar o perfil do usuário para remover a referência à foto
        const updated = await userModel.updateUser(userId, { foto_perfil: null });

        if (!updated) {
            throw new AppError('Falha ao atualizar o perfil do usuário.', 500);
        }

        logger.info(`Foto de perfil removida U:${userId}`);
        res.json({ 
            success: true, 
            message: 'Foto de perfil removida com sucesso!'
        });
    } catch (error) {
        // Melhorar a mensagem de erro para o cliente
        const errorMessage = error.message || 'Erro interno ao remover a foto de perfil';
        const statusCode = error.statusCode || 500;
        
        logger.error(`Erro ao remover foto de perfil: ${errorMessage}`, { stack: error.stack });
        
        res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
};

module.exports = { getUserProfile, updateUserProfile, uploadProfileImage, removeProfileImage };