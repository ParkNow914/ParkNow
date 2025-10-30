const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Vaga = sequelize.define('Vaga', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'ID único da vaga',
    },
    numero: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Número/identificador da vaga',
    },
    status: {
      type: DataTypes.ENUM('livre', 'ocupada', 'reservada', 'manutencao'),
      defaultValue: 'livre',
      allowNull: false,
      comment: 'Status atual da vaga',
    },
    placa: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Placa do veículo estacionado',
    },
    tipo_veiculo: {
      type: DataTypes.ENUM('carro', 'moto', 'caminhao', 'outro'),
      allowNull: true,
      comment: 'Tipo de veículo estacionado',
    },
    entrada: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data e hora de entrada do veículo',
    },
    tempo_estacionado: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Tempo total estacionado em segundos',
    },
    estacionamento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID do estacionamento a que a vaga pertence',
      references: {
        model: 'estacionamentos',
        key: 'id',
      },
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID do usuário que está utilizando a vaga',
      references: {
        model: 'usuarios',
        key: 'id',
      },
    },
    reserva_id_ativa: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID da reserva ativa para esta vaga',
      references: {
        model: 'reservas',
        key: 'id',
      },
    },
  }, {
    tableName: 'vagas',
    timestamps: false, // Explicitly disable timestamps
    underscored: true,
    // Explicitly define default scope to exclude timestamps
    defaultScope: {
      attributes: {
        exclude: ['created_at', 'updated_at']
      }
    }
  });
  
  // Ensure timestamps are excluded from all queries
  Vaga.removeAttribute('created_at');
  Vaga.removeAttribute('updated_at');

  // Associações
  Vaga.associate = function(models) {
    try {
      // Uma vaga pertence a um estacionamento
      Vaga.belongsTo(models.Estacionamento, {
        foreignKey: 'estacionamento_id',
        as: 'estacionamento',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });

      // Uma vaga pode pertencer a um usuário
      if (models.Usuario) {
        Vaga.belongsTo(models.Usuario, {
          foreignKey: 'usuario_id',
          as: 'usuario',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        });
      }

      // Uma vaga pode ter uma reserva ativa
      if (models.Reserva) {
        Vaga.belongsTo(models.Reserva, {
          foreignKey: 'reserva_id_ativa',
          as: 'reservaAtiva',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
        });
      }
    } catch (error) {
      console.error('Erro ao configurar associações do modelo Vaga:', error);
      throw error;
    }
  };

  return Vaga;
};
