'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('horarios_funcionamento', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'ID único do horário de funcionamento',
      },
      estacionamento_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estacionamentos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'ID do estacionamento',
      },
      dia_semana: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)',
      },
      aberto: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Se o estacionamento está aberto neste dia',
      },
      horario_abertura: {
        type: Sequelize.TIME,
        allowNull: true,
        comment: 'Horário de abertura (HH:MM:SS)',
      },
      horario_fechamento: {
        type: Sequelize.TIME,
        allowNull: true,
        comment: 'Horário de fechamento (HH:MM:SS)',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: 'Data de criação do registro',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: 'Data da última atualização do registro',
      },
    }, {
      comment: 'Tabela de horários de funcionamento dos estacionamentos',
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    });

    // Adiciona índices
    await queryInterface.addIndex('horarios_funcionamento', ['estacionamento_id'], {
      name: 'idx_horarios_estacionamento',
    });

    await queryInterface.addIndex('horarios_funcionamento', ['dia_semana'], {
      name: 'idx_horarios_dia_semana',
    });

    await queryInterface.addIndex('horarios_funcionamento', ['estacionamento_id', 'dia_semana'], {
      name: 'idx_horarios_estacionamento_dia',
      unique: true,
    });

    // Adiciona restrição de verificação para horários
    await queryInterface.sequelize.query(
      `ALTER TABLE horarios_funcionamento 
       ADD CONSTRAINT chk_horario_valido 
       CHECK (
         (aberto = false) OR 
         (aberto = true AND horario_abertura IS NOT NULL AND horario_fechamento IS NOT NULL)
       )`
    );
    
    // O Sequelize irá gerenciar o updated_at automaticamente
  },

  down: async (queryInterface, _Sequelize) => {
    // Remove a tabela e todos os seus índices
    await queryInterface.dropTable('horarios_funcionamento');
  }
};
