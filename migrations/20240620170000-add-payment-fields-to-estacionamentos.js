'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Adiciona a coluna chave_pix se não existir
      await queryInterface.addColumn(
        'estacionamentos',
        'chave_pix',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Chave PIX do estacionamento (CNPJ)',
        },
        { transaction }
      );

      // Adiciona a coluna aceita_cartao_credito se não existir
      await queryInterface.addColumn(
        'estacionamentos',
        'aceita_cartao_credito',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Se o estacionamento aceita cartão de crédito',
        },
        { transaction }
      );

      // Adiciona a coluna aceita_cartao_debito se não existir
      await queryInterface.addColumn(
        'estacionamentos',
        'aceita_cartao_debito',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Se o estacionamento aceita cartão de débito',
        },
        { transaction }
      );

      // Adiciona a coluna dados_pagamento se não existir
      await queryInterface.addColumn(
        'estacionamentos',
        'dados_pagamento',
        {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Configurações adicionais de pagamento',
        },
        { transaction }
      );

      // Cria um índice na coluna chave_pix para buscas mais rápidas
      await queryInterface.addIndex('estacionamentos', ['chave_pix'], {
        name: 'idx_estacionamentos_chave_pix',
        transaction,
      });
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Remove as colunas adicionadas
      await queryInterface.removeColumn('estacionamentos', 'chave_pix', { transaction });
      await queryInterface.removeColumn('estacionamentos', 'aceita_cartao_credito', { transaction });
      await queryInterface.removeColumn('estacionamentos', 'aceita_cartao_debito', { transaction });
      await queryInterface.removeColumn('estacionamentos', 'dados_pagamento', { transaction });
      
      // Remove o índice
      await queryInterface.removeIndex('estacionamentos', 'idx_estacionamentos_chave_pix', { transaction });
    });
  }
};
