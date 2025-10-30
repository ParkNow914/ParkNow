const { BaseModel, DataTypes, Op } = require('./baseModel');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

class User extends BaseModel {
  // Métodos de instância
  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.senha);
  }

  // Sobrescreva o método toJSON para não retornar a senha
  toJSON() {
    const values = Object.assign({}, this.get());
    delete values.senha;
    delete values.refresh_token_hash;
    delete values.reset_password_token;
    delete values.reset_password_expires;
    return values;
  }
}

// Inicialização do modelo
User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Identificador único do usuário'
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Nome completo do usuário'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    },
    comment: 'E-mail do usuário (único)'
  },
  senha: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Hash da senha do usuário'
  },
  telefone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Telefone do usuário'
  },
  tipo_veiculo: {
    type: DataTypes.ENUM('Carro', 'Moto', 'SUV', 'Van', 'Pickup'),
    allowNull: true,
    comment: 'Tipo de veículo do usuário'
  },
  placa_veiculo: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Placa do veículo do usuário',
    set(value) {
      // Garante que a placa seja armazenada em maiúsculas
      this.setDataValue('placa_veiculo', value ? value.toUpperCase() : null);
    }
  },
  cpf: {
    type: DataTypes.STRING(14),
    allowNull: true,
    unique: true,
    comment: 'CPF do usuário (apenas números)'
  },
  foto_perfil: {
    type: DataTypes.STRING(512),
    allowNull: true,
    comment: 'URL da foto de perfil do usuário'
  },
  status: {
    type: DataTypes.ENUM('ativo', 'inativo', 'suspenso'),
    defaultValue: 'ativo',
    allowNull: false,
    comment: 'Status da conta do usuário'
  },
  refresh_token_hash: {
    type: DataTypes.STRING(512),
    allowNull: true,
    comment: 'Hash do token de refresh para autenticação'
  },
  reset_password_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Token para redefinição de senha'
  },
  reset_password_expires: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Data de expiração do token de redefinição de senha'
  },
  data_cadastro: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    comment: 'Data de cadastro do usuário'
  },
  ultimo_acesso: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Data do último acesso do usuário'
  }
}, {
  sequelize: require('../config/db.postgres').sequelize,
  modelName: 'User',
  tableName: 'usuarios',
  timestamps: true,
  createdAt: 'data_cadastro',
  updatedAt: 'atualizado_em',
  defaultScope: {
    attributes: { 
      exclude: ['senha', 'refresh_token_hash', 'reset_password_token', 'reset_password_expires'] 
    }
  },
  scopes: {
    withSensitiveData: {
      attributes: { include: [] }
    },
    forAuth: {
      attributes: { include: ['id', 'nome', 'email', 'senha', 'status', 'refresh_token_hash'] }
    },
    forPasswordReset: {
      attributes: { include: ['id', 'email', 'reset_password_token', 'reset_password_expires'] }
    }
  },
  hooks: {
    beforeCreate: async (user) => {
      if (user.senha) {
        const salt = await bcrypt.genSalt(10);
        user.senha = await bcrypt.hash(user.senha, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('senha')) {
        const salt = await bcrypt.genSalt(10);
        user.senha = await bcrypt.hash(user.senha, salt);
      }
    }
  }
});

// Métodos estáticos personalizados
User.findByEmail = async function(email, options = {}) {
  const { includeInactive = false, includePending = false } = options;
  const where = { email };
  
  if (!includeInactive) {
    where[Op.or] = [
      { status: 'ativo' },
      ...(includePending ? [{ status: 'pendente' }] : [])
    ];
  }
  
  return this.findOne({ 
    where,
    ...options,
    ...(includeInactive ? {} : { where: { ...where, ...options.where } })
  });
};

User.findByValidResetToken = async function(token) {
  return this.findOne({
    where: {
      reset_password_token: token,
      reset_password_expires: { [Op.gt]: new Date() }
    },
    attributes: ['id', 'email']
  });
};

User.findByActivationToken = async function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
    
  return this.findOne({
    where: {
      activation_token: hashedToken,
      activation_expires: { [Op.gt]: new Date() },
      ativo: false,
      status: 'pendente'
    }
  });
};

// Atualiza a senha do usuário
User.prototype.updatePassword = async function(newPassword) {
  this.senha = newPassword;
  this.reset_password_token = null;
  this.reset_password_expires = null;
  this.ultima_alteracao_senha = new Date();
  return this.save();
};

// Define o token de refresh
User.prototype.setRefreshToken = async function(refreshToken) {
  const salt = await bcrypt.genSalt(10);
  this.refresh_token_hash = await bcrypt.hash(refreshToken, salt);
  return this.save();
};

// Verifica o token de refresh
User.prototype.verifyRefreshToken = async function(refreshToken) {
  if (!this.refresh_token_hash) return false;
  return bcrypt.compare(refreshToken, this.refresh_token_hash);
};

// Remove o token de refresh
User.prototype.clearRefreshToken = async function() {
  this.refresh_token_hash = null;
  return this.save();
};

// Verifica se o usuário tem uma determinada função
User.prototype.hasRole = function(role) {
  return this.role === role || this.role === 'admin';
};

// Verifica se a conta está ativa
User.prototype.isActive = function() {
  return this.ativo && this.status === 'ativo';
};

// Atualiza o último acesso
User.prototype.updateLastAccess = async function() {
  this.ultimo_acesso = new Date();
  return this.save();
};

/**
 * Gera um token para redefinição de senha
 * @returns {string} Token de redefinição de senha
 */
User.prototype.generatePasswordResetToken = function() {
  // Gera um token aleatório
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Cria um hash do token para armazenar no banco de dados
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  // Define o token e a data de expiração (1 hora a partir de agora)
  this.reset_password_token = hashedToken;
  this.reset_password_expires = Date.now() + 3600000; // 1 hora
  
  // Salva as alterações
  this.save({ validate: false });
  
  return resetToken;
};

/**
 * Gera um token para ativação de conta
 * @returns {string} Token de ativação
 */
User.prototype.generateActivationToken = function() {
  // Gera um token aleatório
  const activationToken = crypto.randomBytes(32).toString('hex');
  
  // Cria um hash do token para armazenar no banco de dados
  const hashedToken = crypto
    .createHash('sha256')
    .update(activationToken)
    .digest('hex');
  
  // Define o token e a data de expiração (24 horas a partir de agora)
  this.activation_token = hashedToken;
  this.activation_expires = Date.now() + 24 * 3600000; // 24 horas
  this.status = 'pendente';
  
  // Salva as alterações
  this.save({ validate: false });
  
  return activationToken;
};

/**
 * Ativa a conta do usuário
 * @returns {Promise<boolean>} True se a conta foi ativada com sucesso
 */
User.prototype.activateAccount = async function() {
  this.activation_token = null;
  this.activation_expires = null;
  this.ativo = true;
  this.status = 'ativo';
  
  try {
    await this.save({ validate: false });
    return true;
  } catch (error) {
    console.error('Erro ao ativar conta:', error);
    return false;
  }
};

/**
 * Atualiza os dados do perfil do usuário
 * @param {Object} profileData - Dados do perfil a serem atualizados
 * @returns {Promise<boolean>} True se a atualização foi bem-sucedida
 */
User.prototype.updateProfile = async function(profileData) {
  try {
    // Atualiza apenas os campos permitidos
    const allowedFields = ['nome', 'telefone', 'tipo_veiculo', 'placa_veiculo', 'foto_perfil'];
    
    allowedFields.forEach(field => {
      if (profileData[field] !== undefined) {
        this[field] = profileData[field];
      }
    });
    
    await this.save();
    return true;
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return false;
  }
};

/**
 * Altera a senha do usuário
 * @param {string} currentPassword - Senha atual
 * @param {string} newPassword - Nova senha
 * @returns {Promise<{success: boolean, message: string}>} Resultado da operação
 */
User.prototype.changePassword = async function(currentPassword, newPassword) {
  try {
    // Verifica se a senha atual está correta
    const isMatch = await this.comparePassword(currentPassword);
    if (!isMatch) {
      return { success: false, message: 'Senha atual incorreta' };
    }
    
    // Atualiza a senha
    this.senha = newPassword;
    await this.save();
    
    return { success: true, message: 'Senha alterada com sucesso' };
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return { success: false, message: 'Erro ao alterar senha' };
  }
};

// Exporta o modelo e a função de inicialização
module.exports = {
  User,
  init: (sequelize, DataTypes) => {
    User.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Identificador único do usuário'
      },
      nome: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Nome completo do usuário'
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        },
        comment: 'E-mail do usuário (único)'
      },
      senha: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Hash da senha do usuário'
      },
      telefone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Telefone do usuário'
      },
      cpf: {
        type: DataTypes.STRING(14),
        allowNull: true,
        unique: true,
        comment: 'CPF do usuário (único)'
      },
      tipo_usuario: {
        type: DataTypes.ENUM('cliente', 'admin', 'funcionario'),
        defaultValue: 'cliente',
        allowNull: false,
        comment: 'Tipo de usuário (cliente, admin, funcionario)'
      },
      status: {
        type: DataTypes.ENUM('ativo', 'inativo', 'suspenso'),
        defaultValue: 'ativo',
        allowNull: false,
        comment: 'Status da conta do usuário'
      },
      data_cadastro: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: 'Data de cadastro do usuário'
      },
      ultimo_acesso: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data do último acesso do usuário'
      },
      reset_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Token para redefinição de senha'
      },
      reset_token_expires: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data de expiração do token de redefinição de senha'
      },
      email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data de verificação do e-mail'
      },
      foto_perfil: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Caminho para a foto de perfil do usuário'
      },
      refresh_token: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'Token de refresh para autenticação JWT'
      },
      refresh_token_expires: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data de expiração do token de refresh'
      },
      activation_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Token para ativação da conta'
      },
      activation_token_expires: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data de expiração do token de ativação'
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Indica se o e-mail do usuário foi verificado'
      },
      last_password_change: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data da última alteração de senha'
      },
      login_attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: 'Número de tentativas de login malsucedidas'
      },
      lock_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data até a qual a conta está bloqueada'
      }
    }, {
      sequelize,
      modelName: 'User',
      tableName: 'usuarios',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      hooks: {
        beforeCreate: async (user) => {
          if (user.senha) {
            const salt = await bcrypt.genSalt(10);
            user.senha = await bcrypt.hash(user.senha, salt);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed('senha')) {
            const salt = await bcrypt.genSalt(10);
            user.senha = await bcrypt.hash(user.senha, salt);
          }
        }
      }
    });
    
    return User;
  }
};
