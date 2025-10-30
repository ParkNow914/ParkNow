'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('pagamentos', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      estacionamento_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'estacionamentos',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reserva_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'reservas',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      valor: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      metodo_pagamento: {
        type: Sequelize.ENUM('pix', 'credit_card', 'debit_card', 'boleto'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          'pending',
          'approved',
          'authorized',
          'in_process',
          'in_mediation',
          'rejected',
          'cancelled',
          'refunded',
          'charged_back'
        ),
        defaultValue: 'pending',
        allowNull: false,
      },
      codigo_pagamento: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      qr_code: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'QR Code para pagamento PIX',
      },
      qr_code_base64: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'QR Code em base64 para exibição no frontend',
      },
      codigo_pix: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Código PIX copia e cola',
      },
      link_pagamento: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Link para a página de pagamento',
      },
      dados_pagamento: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Dados completos do pagamento retornados pelo gateway',
      },
      data_expiracao: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Data de expiração do pagamento',
      },
      data_aprovacao: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Data de aprovação do pagamento',
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

    // Adiciona índices para melhorar o desempenho
    await queryInterface.addIndex('pagamentos', ['estacionamento_id']);
    await queryInterface.addIndex('pagamentos', ['reserva_id']);
    await queryInterface.addIndex('pagamentos', ['codigo_pagamento']);
    await queryInterface.addIndex('pagamentos', ['status']);
    await queryInterface.addIndex('pagamentos', ['data_criacao']);
    await queryInterface.addIndex('pagamentos', ['data_expiracao']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('pagamentos');
  }
};
