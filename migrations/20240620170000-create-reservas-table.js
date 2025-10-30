'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('reservas', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuarios',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      vaga_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'vagas',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      estacionamento_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estacionamentos',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      placa_veiculo: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      horario_inicio_reserva: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      horario_fim_reserva: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          'pendente',
          'confirmada',
          'em_andamento',
          'finalizada',
          'cancelada',
          'expirada',
          'pendente_pagamento',
          'pagamento_aprovado',
          'pagamento_recusado'
        ),
        defaultValue: 'pendente_pagamento',
        allowNull: false,
      },
      valor_reserva: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      metodo_pagamento: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      status_pagamento: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      dados_pagamento: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      data_criacao: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      data_atualizacao: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Adiciona índices para melhorar desempenho
    await queryInterface.addIndex('reservas', ['usuario_id']);
    await queryInterface.addIndex('reservas', ['vaga_id']);
    await queryInterface.addIndex('reservas', ['estacionamento_id']);
    await queryInterface.addIndex('reservas', ['status']);
    await queryInterface.addIndex('reservas', ['horario_inicio_reserva', 'horario_fim_reserva']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('reservas');
  },
};
