const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { User } = require('../../models');
const { AppError: _AppError, NotFoundError, BadRequestError } = require('../../utils/AppError');
const _logger = require('../../utils/logger');

// Configurações
const PROFILE_IMAGE_SIZE = 300; // Tamanho padrão para imagens de perfil (300x300 pixels)
const UPLOADS_DIR = path.join(__dirname, '../../uploads/profile_images');

// Garante que o diretório de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Obtém o perfil do usuário autenticado
 */
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado.');
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * Atualiza o perfil do usuário
 */
const updateUserProfile = async (req, res, next) => {
  const userId = req.user.id;
  const transaction = await User.sequelize.transaction();
  
  try {
    const { nome, telefone, tipo_veiculo, placa_veiculo, cpf } = req.body;
    
    // Busca o usuário atual
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      throw new NotFoundError('Usuário não encontrado.');
    }
    
    // Atualiza os campos fornecidos
    if (nome !== undefined) user.nome = nome;
    if (telefone !== undefined) user.telefone = telefone;
    if (tipo_veiculo !== undefined) user.tipo_veiculo = tipo_veiculo;
    if (placa_veiculo !== undefined) user.placa_veiculo = placa_veiculo;
    if (cpf !== undefined) user.cpf = cpf;
    
    // Salva as alterações
    await user.save({ transaction });
    await transaction.commit();
    
    // Busca o usuário atualizado sem os campos sensíveis
    const updatedUser = await User.findByPk(userId);
    res.json(updatedUser);
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * Faz upload da foto de perfil do usuário
 */
const uploadProfileImage = async (req, res, next) => {
  if (!req.file) {
    return next(new BadRequestError('Nenhuma imagem fornecida.'));
  }
  
  const userId = req.user.id;
  const transaction = await User.sequelize.transaction();
  
  try {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      throw new NotFoundError('Usuário não encontrado.');
    }
    
    // Caminho para salvar a imagem
    const filename = `profile-${userId}-${Date.now()}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);
    
    // Processa a imagem
    await sharp(req.file.buffer)
      .resize(PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 90 })
      .toFile(filepath);
    
    // Remove a imagem antiga se existir
    if (user.foto_perfil) {
      const oldImagePath = path.join(UPLOADS_DIR, path.basename(user.foto_perfil));
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    
    // Atualiza o caminho da imagem no banco de dados
    user.foto_perfil = `/uploads/profile_images/${filename}`;
    await user.save({ transaction });
    await transaction.commit();
    
    res.json({
      success: true,
      message: 'Foto de perfil atualizada com sucesso.',
      imageUrl: user.foto_perfil
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

/**
 * Remove a foto de perfil do usuário
 */
const removeProfileImage = async (req, res, next) => {
  const userId = req.user.id;
  const transaction = await User.sequelize.transaction();
  
  try {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction.rollback();
      throw new NotFoundError('Usuário não encontrado.');
    }
    
    // Verifica se o usuário tem uma foto de perfil
    if (!user.foto_perfil) {
      await transaction.rollback();
      throw new BadRequestError('Nenhuma foto de perfil encontrada para remoção.');
    }
    
    // Remove o arquivo de imagem
    const imagePath = path.join(__dirname, '../../public', user.foto_perfil);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // Atualiza o perfil do usuário
    user.foto_perfil = null;
    await user.save({ transaction });
    await transaction.commit();
    
    res.json({
      success: true,
      message: 'Foto de perfil removida com sucesso.'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
  removeProfileImage
};
