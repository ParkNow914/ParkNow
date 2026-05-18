'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('reservas', 'id_pagamento', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'ID do pagamento no gateway de pagamento'
    });

    await queryInterface.addColumn('reservas', 'qr_code', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'QR Code para pagamento via PIX'
    });

    await queryInterface.addColumn('reservas', 'qr_code_base64', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'QR Code em base64 para exibição no frontend'
    });

    await queryInterface.addColumn('reservas', 'codigo_pix', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Código PIX copia e cola'
    });

    await queryInterface.addColumn('reservas', 'data_expiracao_pix', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Data de expiração do PIX'
    });

    await queryInterface.addColumn('reservas', 'pagador_nome', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Nome do pagador'
    });

    await queryInterface.addColumn('reservas', 'pagador_email', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Email do pagador'
    });

    await queryInterface.addColumn('reservas', 'pagador_cpf', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'CPF do pagador (apenas números)'
    });

    // Adiciona índices para melhorar o desempenho das consultas
    await queryInterface.addIndex('reservas', ['id_pagamento']);
    await queryInterface.addIndex('reservas', ['status_pagamento']);
    await queryInterface.addIndex('reservas', ['data_expiracao_pix']);
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.removeColumn('reservas', 'id_pagamento');
    await queryInterface.removeColumn('reservas', 'qr_code');
    await queryInterface.removeColumn('reservas', 'qr_code_base64');
    await queryInterface.removeColumn('reservas', 'codigo_pix');
    await queryInterface.removeColumn('reservas', 'data_expiracao_pix');
    await queryInterface.removeColumn('reservas', 'pagador_nome');
    await queryInterface.removeColumn('reservas', 'pagador_email');
    await queryInterface.removeColumn('reservas', 'pagador_cpf');
  }
};
