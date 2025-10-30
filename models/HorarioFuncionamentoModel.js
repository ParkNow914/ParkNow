const { DataTypes } = require('sequelize');

/**
 * Modelo para a tabela de horários de funcionamento
 */
module.exports = (sequelize) => {
  const HorarioFuncionamento = sequelize.define('HorarioFuncionamento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'ID único do horário de funcionamento',
    },
    estacionamento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID do estacionamento',
      references: {
        model: 'estacionamentos',
        key: 'id'
      }
    },
    dia_semana: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        max: 6
      },
      comment: 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)',
    },
    aberto: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Se o estacionamento está aberto neste dia',
    },
    horario_abertura: {
      type: DataTypes.TIME,
      allowNull: true,
      comment: 'Horário de abertura (HH:MM:SS)',
    },
    horario_fechamento: {
      type: DataTypes.TIME,
      allowNull: true,
      comment: 'Horário de fechamento (HH:MM:SS)',
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
      comment: 'Data da última atualização do registro',
    },
  }, {
    tableName: 'horarios_funcionamento',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    comment: 'Tabela de horários de funcionamento dos estacionamentos',
    indexes: [
      {
        name: 'idx_horarios_estacionamento',
        fields: ['estacionamento_id'],
      },
      {
        name: 'idx_horarios_dia_semana',
        fields: ['dia_semana'],
      },
      {
        name: 'idx_horarios_estacionamento_dia',
        unique: true,
        fields: ['estacionamento_id', 'dia_semana'],
      },
    ],
  });

  // Hooks (ganchos) do modelo
  HorarioFuncionamento.beforeSave((horario) => {
    // Garante que os horários estejam no formato correto
    if (horario.horario_abertura && typeof horario.horario_abertura === 'string') {
      horario.horario_abertura = horario.horario_abertura.substring(0, 8); // Garante o formato HH:MM:SS
    }
    if (horario.horario_fechamento && typeof horario.horario_fechamento === 'string') {
      horario.horario_fechamento = horario.horario_fechamento.substring(0, 8); // Garante o formato HH:MM:SS
    }
  });

  // Associações serão definidas no arquivo models/index.js

  return HorarioFuncionamento;
};
