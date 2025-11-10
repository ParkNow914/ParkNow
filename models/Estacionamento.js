const { DataTypes, Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Modelo para a tabela de estacionamentos
 */
module.exports = (sequelize) => {
  const Estacionamento = sequelize.define('Estacionamento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'ID único do estacionamento',
    },
    nome: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Nome do estacionamento',
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      comment: 'Coordenada de latitude do estacionamento',
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      comment: 'Coordenada de longitude do estacionamento',
    },
    endereco: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Endereço completo do estacionamento',
    },
    telefone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Telefone de contato do estacionamento',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true,
      },
      comment: 'E-mail de contato do estacionamento',
    },
    vagas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Número total de vagas do estacionamento',
    },
    preco_hora: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      comment: 'Preço por hora de estacionamento',
    },
    preco_dia: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      comment: 'Preço por dia de estacionamento',
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Descrição detalhada do estacionamento',
    },
    foto: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'URL da foto do estacionamento',
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID do administrador responsável pelo estacionamento',
    },
    // Campos de pagamento
    chave_pix: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Chave PIX do estacionamento (CNPJ, e-mail, telefone ou chave aleatória)',
    },
    tipo_chave_pix: {
      type: DataTypes.ENUM('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'CHAVE_ALEATORIA'),
      allowNull: true,
      comment: 'Tipo da chave PIX',
    },
    nome_titular_pix: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Nome do titular da conta PIX',
    },
    status: {
      type: DataTypes.ENUM('ATIVO', 'INATIVO', 'EM_MANUTENCAO'),
      allowNull: false,
      defaultValue: 'ATIVO',
      comment: 'Status do estacionamento',
    },
  }, {
    tableName: 'estacionamentos',
    timestamps: false, // Disable automatic timestamps since we're managing them manually
    underscored: true,
    comment: 'Tabela de estacionamentos do sistema'
  });

  // Adiciona índices para melhorar o desempenho das consultas
  // Os índices serão criados através de migrações
  // Exemplo de como seria em uma migração:
  // await queryInterface.addIndex('estacionamentos', ['chave_pix'], {
  //   name: 'idx_estacionamentos_chave_pix',
  //   unique: false
  // });


  // Hooks (ganchos) do modelo
  Estacionamento.beforeCreate(async (estacionamento) => {
    // Garante que os valores numéricos estejam no formato correto
    if (estacionamento.preco_hora) {
      estacionamento.preco_hora = parseFloat(estacionamento.preco_hora) || 0.0;
    }
    if (estacionamento.preco_dia) {
      estacionamento.preco_dia = parseFloat(estacionamento.preco_dia) || 0.0;
    }
    if (estacionamento.vagas) {
      estacionamento.vagas = parseInt(estacionamento.vagas) || 0;
    }
    
    // Valida a chave PIX se fornecida
    if (estacionamento.chave_pix && !estacionamento.tipo_chave_pix) {
      throw new Error('Tipo de chave PIX é obrigatório quando uma chave PIX é fornecida');
    }
  });

  // Métodos de instância
  Estacionamento.prototype.toJSON = function() {
    const values = { ...this.get() };
    // Note: Removed timestamp deletions since we're not using them
    return values;
  };

  // Métodos estáticos
  Estacionamento.buscarPorMetodoPagamento = async function(metodo) {
    try {
      // Apenas suporta PIX agora
      if (metodo !== 'pix') {
        return [];
      }
      
      return await this.findAll({
        where: {
          chave_pix: { [Op.ne]: null },
          tipo_chave_pix: { [Op.ne]: null },
          nome_titular_pix: { [Op.ne]: null }
        },
        attributes: { 
          exclude: ['created_at', 'updated_at']
        }
      });
    } catch (error) {
      logger.error('Erro ao buscar estacionamentos por método de pagamento:', error);
      throw error;
    }
  };

  // Método para buscar estacionamento com seus horários de funcionamento
  Estacionamento.buscarComHorarios = async function(id) {
    try {
      const estacionamento = await this.findByPk(id, {
        include: [
          {
            model: sequelize.models.HorarioFuncionamento,
            as: 'horariosFuncionamento',
            attributes: ['id', 'dia_semana', 'aberto', 'horario_abertura', 'horario_fechamento']
          }
        ]
      });
      
      // Se não encontrou horários, cria os padrões
      if (estacionamento && (!estacionamento.horariosFuncionamento || estacionamento.horariosFuncionamento.length === 0)) {
        await this.criarHorariosPadrao(id);
        return this.buscarComHorarios(id); // Chama recursivamente para retornar com os horários criados
      }
      
      return estacionamento;
    } catch (error) {
      console.error('Erro ao buscar estacionamento com horários:', error);
      throw error;
    }
  };
  
  // Método para criar horários padrão para um estacionamento
  Estacionamento.criarHorariosPadrao = async function(estacionamentoId) {
    try {
      const diasDaSemana = [
        { dia_semana: 0, nome: 'Domingo', aberto: false },
        { dia_semana: 1, nome: 'Segunda', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '18:00:00' },
        { dia_semana: 2, nome: 'Terça', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '18:00:00' },
        { dia_semana: 3, nome: 'Quarta', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '18:00:00' },
        { dia_semana: 4, nome: 'Quinta', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '18:00:00' },
        { dia_semana: 5, nome: 'Sexta', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '18:00:00' },
        { dia_semana: 6, nome: 'Sábado', aberto: true, horario_abertura: '08:00:00', horario_fechamento: '12:00:00' }
      ];
      
      for (const dia of diasDaSemana) {
        await sequelize.models.HorarioFuncionamento.create({
          estacionamento_id: estacionamentoId,
          dia_semana: dia.dia_semana,
          aberto: dia.aberto,
          horario_abertura: dia.horario_abertura,
          horario_fechamento: dia.horario_fechamento
        });
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao criar horários padrão:', error);
      throw error;
    }
  };

  // Associações
  Estacionamento.associate = function(models) {
    try {
      // Verificar se o modelo User está disponível
      if (models.User) {
        // Um estacionamento pertence a um administrador
        Estacionamento.belongsTo(models.User, {
          foreignKey: 'admin_id',
          as: 'admin',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        });
      }
      
      // Verificar se o modelo Vaga está disponível
      if (models.Vaga) {
        // Um estacionamento tem muitas vagas
        Estacionamento.hasMany(models.Vaga, {
          foreignKey: 'estacionamento_id',
          as: 'vagasLista',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        });
      }
      
      // Verificar se o modelo Reserva está disponível
      if (models.Reserva) {
        // Um estacionamento tem muitas reservas
        Estacionamento.hasMany(models.Reserva, {
          foreignKey: 'estacionamento_id',
          as: 'reservas',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        });
      }
      
      // Verificar se o modelo HorarioFuncionamento está disponível
      if (models.HorarioFuncionamento) {
        // Um estacionamento tem muitos horários de funcionamento
        Estacionamento.hasMany(models.HorarioFuncionamento, {
          foreignKey: 'estacionamento_id',
          as: 'horariosFuncionamento',
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        });
      }
    } catch (error) {
      console.error('Erro ao configurar associações do modelo Estacionamento:', error);
      throw error;
    }
  };

  return Estacionamento;
};
