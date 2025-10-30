const { Sequelize, Model, DataTypes } = require('sequelize');

class BaseModel extends Model {
  // Métodos comuns a todos os modelos podem ser adicionados aqui
  
  static async findById(id, options = {}) {
    return this.findByPk(id, options);
  }
  
  static async findAllActive(options = {}) {
    return this.findAll({
      where: { is_active: true },
      ...options
    });
  }
  
  // Adicione outros métodos comuns conforme necessário
}

// Exporta a classe base e os tipos do Sequelize
module.exports = {
  BaseModel,
  DataTypes,
  Op: Sequelize.Op,
  Sequelize
};
