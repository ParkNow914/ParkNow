// controllers/userController.js
const userModel = require('../models/userModel');
const { invalidateUserCache } = require('../middleware/authMiddleware');
const { AppError, NotFoundError, BadRequestError } = require('../utils/AppError');
const logger = require('../utils/logger');
const config = require('../config');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configurações para a imagem de perfil
const PROFILE_IMAGE_SIZE = 300; // Tamanho padrão para imagens de perfil (300x300 pixels)

// Fotos de perfil são dados pessoais: ficam FORA de public/ (não são servidas
// estaticamente) e são entregues apenas pelo endpoint autenticado
// GET /api/user/profile/foto. Em produção (Fly.io) uploads/ é volume
// persistente — public/ não é, então salvar lá também perdia as fotos a cada deploy.
const PROFILE_UPLOAD_DIR = path.join(config.uploads.path, 'profile');
// Diretório legado (fotos antigas salvas dentro de public/), mantido apenas
// para leitura/remoção de arquivos pré-existentes em disco.
const LEGACY_PROFILE_DIR = path.join(__dirname, '../public/user/img/profile');

/**
 * Resolve o caminho físico da foto de perfil a partir do valor salvo no banco,
 * restringindo a busca aos diretórios de perfil (anti path-traversal).
 * @returns {string|null} Caminho absoluto do arquivo ou null se não existir.
 */
function resolveProfileImagePath(fotoPerfil) {
    if (!fotoPerfil) return null;
    const filename = path.basename(fotoPerfil);
    if (!filename || filename === '.' || filename === '..') return null;
    for (const dir of [PROFILE_UPLOAD_DIR, LEGACY_PROFILE_DIR]) {
        const fullPath = path.join(dir, filename);
        if (fs.existsSync(fullPath)) return fullPath;
    }
    return null;
}

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
        invalidateUserCache(userId);

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
const uploadProfileImage = async (req, res, _next) => {
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
        if (!fs.existsSync(PROFILE_UPLOAD_DIR)) {
            try {
                fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });
                logger.info(`Diretório de uploads criado: ${PROFILE_UPLOAD_DIR}`);
            } catch (err) {
                logger.error(`Erro ao criar diretório de uploads: ${err.message}`);
                throw new AppError('Erro ao criar diretório de uploads.', 500);
            }
        }

        // Se o usuário já tinha uma imagem, remover a antiga
        if (currentUserData.foto_perfil) {
            try {
                const oldImagePath = resolveProfileImagePath(currentUserData.foto_perfil);
                if (oldImagePath) {
                    fs.unlinkSync(oldImagePath);
                    logger.info(`Imagem antiga removida: ${path.basename(oldImagePath)}`);
                }
            } catch (err) {
                // Apenas logar o erro, não interromper o fluxo
                logger.warn(`Erro ao remover imagem antiga: ${err.message}`);
            }
        }

        // Gerar um nome único para a imagem processada
        const filename = `profile-${userId}-${Date.now()}.jpg`;
        const outputPath = path.join(PROFILE_UPLOAD_DIR, filename);

        // Processar e redimensionar a imagem usando Sharp
        try {
            if (!fs.existsSync(req.file.path)) {
                throw new Error(`Arquivo de upload não encontrado: ${req.file.path}`);
            }

            await sharp(req.file.path)
                .rotate()               // Corrige automaticamente a rotação com base nos metadados EXIF
                .resize({
                    width: PROFILE_IMAGE_SIZE,
                    height: PROFILE_IMAGE_SIZE,
                    fit: 'cover',      // Corta a imagem para preencher o tamanho especificado
                    position: 'centre'  // Centraliza o corte
                })
                .withMetadata({ orientation: 1 })  // Normaliza a orientação (descarta demais EXIF)
                .jpeg({ quality: 90 })  // Converte para JPEG com 90% de qualidade
                .toFile(outputPath);    // Salva no caminho de destino

            // Remove o arquivo original do upload (best-effort)
            try { fs.unlinkSync(req.file.path); } catch (_e) { /* não crítico */ }

            logger.info(`Imagem de perfil processada: ${filename}`);
        } catch (err) {
            logger.error(`Erro ao processar imagem de perfil: ${err.message}`, { stack: err.stack });
            throw new AppError(`Erro ao processar a imagem: ${err.message}`, 500);
        }

        // URL autenticada por onde o frontend busca a foto (cache-bust por timestamp).
        const imageUrl = `/api/user/profile/foto?v=${Date.now()}`;
        // No banco guardamos a referência do arquivo para resolução interna.
        const fotoPerfilRef = `/uploads/profile/${filename}`;

        // Atualizar o perfil do usuário com a referência da nova imagem
        const updated = await userModel.updateUser(userId, { foto_perfil: fotoPerfilRef });

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
        const errorMessage = error.message || 'Erro interno ao processar o upload da imagem';
        const statusCode = error.statusCode || 500;

        logger.error(`Erro no upload de imagem: ${errorMessage}`, { stack: error.stack });

        res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
};

/**
 * Entrega a foto de perfil do PRÓPRIO usuário autenticado.
 * As fotos não são servidas estaticamente por conterem dados pessoais.
 *
 * GET /api/user/profile/foto
 */
const getProfileImage = async (req, res, next) => {
    try {
        const user = await userModel.findUserById(req.user.id);
        if (!user) throw new NotFoundError('Usuário não encontrado.');
        if (!user.foto_perfil) throw new NotFoundError('Usuário não possui foto de perfil.');

        const imagePath = resolveProfileImagePath(user.foto_perfil);
        if (!imagePath) throw new NotFoundError('Arquivo da foto de perfil não encontrado.');

        res.set('Cache-Control', 'private, max-age=300');
        res.sendFile(imagePath);
    } catch (error) {
        next(error);
    }
};

/**
 * Remove a foto de perfil do usuário
 */
const removeProfileImage = async (req, res, _next) => {
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
            const oldImagePath = resolveProfileImagePath(currentUserData.foto_perfil);
            if (oldImagePath) {
                fs.unlinkSync(oldImagePath);
                logger.info(`Imagem removida: ${path.basename(oldImagePath)}`);
            }
        } catch (err) {
            // Apenas logar o erro, não interromper o fluxo
            logger.warn(`Erro ao processar remoção de imagem: ${err.message}`);
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

module.exports = { getUserProfile, updateUserProfile, uploadProfileImage, getProfileImage, removeProfileImage };