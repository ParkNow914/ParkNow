const { DataTypes, Model } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Modelo para a tabela de horários de funcionamento dos estacionamentos
 */
module.exports = (_sequelize) => {
  class HorarioFuncionamento extends Model {
    /**
     * Inicializa o modelo
     * @param {import('sequelize').Sequelize} sequelize - Instância do Sequelize
     */
    static initialize(sequelize) {
      return HorarioFuncionamento.init(
        {
          id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: 'ID único do horário de funcionamento',
          },
          estacionamento_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'ID do estacionamento ao qual o horário pertence',
            references: {
              model: 'estacionamentos',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          dia_semana: {
            type: DataTypes.INTEGER,
            allowNull: false,
            comment: 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)',
            validate: {
              min: 0,
              max: 6,
            },
          },
          nome: {
            type: DataTypes.STRING(20),
            allowNull: false,
            comment: 'Nome do dia da semana',
          },
          aberto: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Indica se o estacionamento está aberto neste dia',
          },
          horario_abertura: {
            type: DataTypes.TIME,
            allowNull: true,
            comment: 'Horário de abertura no formato HH:MM:SS',
            validate: {
              isTimeFormat: (value) => {
                if (!value) return;
                if (!/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value)) {
                  throw new Error('Formato de horário inválido. Use HH:MM:SS');
                }
              },
            },
          },
          horario_fechamento: {
            type: DataTypes.TIME,
            allowNull: true,
            comment: 'Horário de fechamento no formato HH:MM:SS',
            validate: {
              isTimeFormat: (value) => {
                if (!value) return;
                if (!/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(value)) {
                  throw new Error('Formato de horário inválido. Use HH:MM:SS');
                }
              },
            },
          },
          created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            comment: 'Data de criação do registro',
          },
          updated_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            onUpdate: DataTypes.NOW,
            comment: 'Data da última atualização do registro',
          },
        },
        {
          sequelize,
          modelName: 'HorarioFuncionamento', // Nome do modelo
          tableName: 'horarios_funcionamento', // Nome da tabela no banco de dados
          timestamps: false, // Desativa os timestamps automáticos do Sequelize (usamos created_at/updated_at manualmente)
          underscored: true, // Usa snake_case para os nomes das colunas
          comment: 'Tabela que armazena os horários de funcionamento dos estacionamentos',
        }
      );
    }

    /**
     * Define as associações do modelo
     * @param {Object} models - Objeto contendo todos os modelos carregados
     */
    static associate(models) {
      // Associação com Estacionamento (muitos horários pertencem a um estacionamento)
      HorarioFuncionamento.belongsTo(models.Estacionamento, {
        foreignKey: 'estacionamento_id',
        as: 'estacionamento',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });
    }

    /**
     * Busca horários de funcionamento por estacionamento
     * @param {number} estacionamentoId - ID do estacionamento
     * @param {Object} options - Opções adicionais para a consulta
     * @returns {Promise<Array>} Array de horários de funcionamento
     */
    static async buscarPorEstacionamento(estacionamentoId, options = {}) {
      try {
        return await this.findAll({
          where: { estacionamento_id: estacionamentoId },
          order: [['dia_semana', 'ASC']],
          ...options,
        });
      } catch (error) {
        logger.error('Erro ao buscar horários por estacionamento:', {
          error: error.message,
          stack: error.stack,
          estacionamentoId,
        });
        throw error;
      }
    }

    /**
     * Busca horário de funcionamento por dia da semana
     * @param {number} estacionamentoId - ID do estacionamento
     * @param {number} diaSemana - Número do dia da semana (0-6)
     * @param {Object} options - Opções adicionais para a consulta
     * @returns {Promise<Object|null>} Horário de funcionamento ou null se não encontrado
     */
    static async buscarPorDia(estacionamentoId, diaSemana, options = {}) {
      try {
        return await this.findOne({
          where: {
            estacionamento_id: estacionamentoId,
            dia_semana: diaSemana,
          },
          ...options,
        });
      } catch (error) {
        logger.error('Erro ao buscar horário por dia:', {
          error: error.message,
          stack: error.stack,
          estacionamentoId,
          diaSemana,
        });
        throw error;
      }
    }
  }

  return HorarioFuncionamento;
};
