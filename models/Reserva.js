const { Model, DataTypes, Op } = require('sequelize');
const logger = require('../utils/logger');

// Status de reserva
const RESERVATION_STATUS = {
  PENDENTE: 'pendente',
  CONFIRMADA: 'confirmada',
  EM_ANDAMENTO: 'em_andamento',
  FINALIZADA: 'finalizada',
  CANCELADA: 'cancelada',
  EXPIRADA: 'expirada',
  PENDENTE_PAGAMENTO: 'pendente_pagamento',
  PAGAMENTO_APROVADO: 'pagamento_aprovado',
  PAGAMENTO_RECUSADO: 'pagamento_recusado'
};

// Métodos auxiliares
const calcularValorReserva = (horarioInicio, horarioFim, valorHora) => {
  const diffMs = new Date(horarioFim) - new Date(horarioInicio);
  const diffHours = diffMs / (1000 * 60 * 60);
  return (diffHours * valorHora).toFixed(2);
};

module.exports = (sequelize) => {
  class Reserva extends Model {
    static async createReserva(reservaData, transaction) {
      try {
        return await this.create({
          usuario_id: reservaData.usuario_id,
          vaga_id: reservaData.vaga_id,
          estacionamento_id: reservaData.estacionamento_id,
          placa_veiculo: reservaData.placa_veiculo,
          horario_inicio_reserva: reservaData.horario_inicio_reserva,
          horario_fim_reserva: reservaData.horario_fim_reserva,
          status: reservaData.status || 'pendente_pagamento',
          valor_reserva: reservaData.valor_reserva,
          metodo_pagamento: reservaData.metodo_pagamento,
          status_pagamento: reservaData.status_pagamento || 'pending',
          dados_pagamento: reservaData.dados_pagamento || {}
        }, { transaction });
      } catch (error) {
        logger.error('Erro ao criar reserva:', error);
        throw error;
      }
    }

    static async findActiveReservaByVagaId(vagaId, transaction) {
      try {
        return await this.findOne({
          where: {
            vaga_id: vagaId,
            status: [
              RESERVATION_STATUS.CONFIRMADA, 
              RESERVATION_STATUS.EM_ANDAMENTO, 
              RESERVATION_STATUS.PENDENTE_PAGAMENTO
            ]
          },
          transaction
        });
      } catch (error) {
        logger.error('Erro ao buscar reserva ativa por vaga:', error);
        throw error;
      }
    }

  static async findActiveReservaByUsuarioAndEstacionamento(usuarioId, estacionamentoId, transaction) {
    try {
      return await this.findOne({
        where: {
          usuario_id: usuarioId,
          estacionamento_id: estacionamentoId,
          status: [RESERVATION_STATUS.CONFIRMADA, RESERVATION_STATUS.EM_ANDAMENTO, RESERVATION_STATUS.PENDENTE_PAGAMENTO]
        },
        transaction
      });
    } catch (error) {
      logger.error('Erro ao buscar reserva ativa por usuário e estacionamento:', error);
      throw error;
    }
  }

  static async findActiveReservaByEstacionamento(estacionamentoId, transaction) {
    try {
      return await this.findOne({
        where: {
          estacionamento_id: estacionamentoId,
          status: [RESERVATION_STATUS.CONFIRMADA, RESERVATION_STATUS.EM_ANDAMENTO, RESERVATION_STATUS.PENDENTE_PAGAMENTO]
        },
        transaction
      });
    } catch (error) {
      logger.error('Erro ao buscar reserva ativa por estacionamento:', error);
      throw error;
    }
  }

  static async findReservaById(reservaId, transaction) {
    try {
      return await this.findByPk(reservaId, {
        include: [
          {
            association: 'estacionamento',
            attributes: ['id', 'nome', 'endereco', 'cidade', 'estado', 'cep']
          },
          {
            association: 'vaga',
            attributes: ['id', 'numero', 'tipo']
          },
          {
            association: 'usuario',
            attributes: ['id', 'nome', 'email', 'telefone']
          }
        ],
        transaction
      });
    } catch (error) {
      logger.error('Erro ao buscar reserva por ID:', error);
      throw error;
    }
  }

  static async isVagaAvailableForPeriod(vagaId, inicio, fim, transaction) {
    try {
      const count = await this.count({
        where: {
          vaga_id: vagaId,
          [Op.or]: [
            {
              horario_inicio_reserva: { [Op.lt]: new Date(fim) },
              horario_fim_reserva: { [Op.gt]: new Date(inicio) }
            }
          ],
          status: [RESERVATION_STATUS.CONFIRMADA, RESERVATION_STATUS.EM_ANDAMENTO, RESERVATION_STATUS.PENDENTE_PAGAMENTO]
        },
        transaction
      });

      return count === 0;
    } catch (error) {
      logger.error('Erro ao verificar disponibilidade da vaga:', error);
      throw error;
    }
  }

  static async expireUnusedReservas(transaction) {
    try {
      const [count] = await this.update(
        { status: RESERVATION_STATUS.EXPIRADA },
        {
          where: {
            status: RESERVATION_STATUS.PENDENTE_PAGAMENTO,
            horario_inicio_reserva: { [Op.lt]: new Date() },
            horario_fim_reserva: { [Op.lt]: new Date() }
          },
          transaction
        }
      );

      return { expiredCount: count };
    } catch (error) {
      logger.error('Erro ao expirar reservas não utilizadas:', error);
      throw error;
    }
  }

  static async findReservasByUsuario(usuarioId, options = {}, transaction) {
    try {
      const { limit = 50, offset = 0, orderBy = 'createdAt', order = 'DESC' } = options;
      
      return await this.findAndCountAll({
        where: { usuario_id: usuarioId },
        include: [
          {
            association: 'estacionamento',
            attributes: ['id', 'nome', 'endereco', 'cidade', 'estado']
          },
          {
            association: 'vaga',
            attributes: ['id', 'numero', 'tipo']
          }
        ],
        order: [[orderBy, order]],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        transaction
      });
    } catch (error) {
      logger.error('Erro ao buscar reservas por usuário:', error);
      throw error;
    }
  }

  static async atualizarStatus(reservaId, novoStatus, transaction) {
    try {
      const [count] = await this.update(
        { status: novoStatus },
        {
          where: { id: reservaId },
          transaction
        }
      );

      if (count > 0) {
        logger.info(`Status da reserva ${reservaId} atualizado para: ${novoStatus}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Erro ao atualizar status da reserva:', {
        error: error.message,
        reservaId,
        novoStatus,
        stack: error.stack
      });
      throw error;
    }
  }

  static async findByTxid(txid, transaction) {
    try {
      return await this.findOne({
        where: {
          'dados_pagamento.txid': txid
        },
        transaction
      });
    } catch (error) {
      logger.error('Erro ao buscar reserva por TXID:', {
        error: error.message,
        txid,
        stack: error.stack
      });
      throw error;
    }
  }

  static calcularValorReserva(inicio, fim, precoHora) {
    const diffMs = new Date(fim) - new Date(inicio);
    const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));
    return parseFloat((diffHoras * precoHora).toFixed(2));
  }

  }

  Reserva.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        comment: 'ID único da reserva'
      },
      codigo_reserva: {
        type: DataTypes.STRING(12),
        unique: true,
        allowNull: false,
        comment: 'Código único da reserva para identificação'
      },
      usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID do usuário que fez a reserva',
        references: {
          model: 'usuarios',
          key: 'id'
        }
      },
      vaga_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID da vaga reservada',
        references: {
          model: 'vagas',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      estacionamento_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'ID do estacionamento onde está a vaga',
        references: {
          model: 'estacionamentos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      placa_veiculo: {
        type: DataTypes.STRING(8),
        allowNull: false,
        comment: 'Placa do veículo que ocupará a vaga'
      },
      horario_inicio_reserva: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Data e hora de início da reserva'
      },
      horario_fim_reserva: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Data e hora de término da reserva'
      },
      status: {
        type: DataTypes.ENUM(
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
        allowNull: false,
        defaultValue: 'pendente_pagamento',
        comment: 'Status atual da reserva'
      },
      valor_reserva: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Valor total da reserva'
      },
      metodo_pagamento: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Método de pagamento utilizado (pix, cartao_credito, cartao_debito, dinheiro)'
      },
      status_pagamento: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Status do pagamento (pending, approved, in_process, in_mediation, rejected, cancelled, refunded, charged_back)'
      },
      dados_pagamento: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Dados adicionais do pagamento (ID do pagamento, dados do cartão, etc)'
      },
      check_in: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data e hora em que o usuário fez check-in na vaga'
      },
      check_out: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Data e hora em que o usuário fez check-out da vaga'
      },
      tempo_estacionado_minutos: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Tempo total que o veículo ficou estacionado em minutos'
      },
      valor_pago: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Valor efetivamente pago pelo usuário'
      },
      desconto_aplicado: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        comment: 'Valor de desconto aplicado na reserva'
      },
      taxa_servico: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00,
        comment: 'Taxa de serviço aplicada à reserva'
      },
      observacoes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Observações adicionais sobre a reserva'
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID do usuário que criou o registro',
        references: {
          model: 'usuarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID do usuário que atualizou o registro',
        references: {
          model: 'usuarios',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }
    },
    {
      sequelize,
      modelName: 'Reserva',
      tableName: 'reservas',
      timestamps: true,
      underscored: true,
      paranoid: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at',
      defaultScope: {
        attributes: {
          exclude: ['deleted_at']
        }
      }
    }
  );

  // Associações
  Reserva.associate = function(models) {
    try {
      // Associação com Usuário
      if (models.Usuario) {
        Reserva.belongsTo(models.Usuario, {
          foreignKey: 'usuario_id',
          as: 'usuario',
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        });
      }

      // Associação com Vaga
      if (models.Vaga) {
        Reserva.belongsTo(models.Vaga, {
          foreignKey: 'vaga_id',
          as: 'vaga',
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        });
      }

      // Associação com Estacionamento
      if (models.Estacionamento) {
        Reserva.belongsTo(models.Estacionamento, {
          foreignKey: 'estacionamento_id',
          as: 'estacionamento',
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        });
      }
    } catch (error) {
      console.error('Erro ao configurar associações do modelo Reserva:', error);
      throw error;
    }
  };

  // Adiciona a constante RESERVATION_STATUS ao modelo
  Reserva.RESERVATION_STATUS = RESERVATION_STATUS;

  // Scopes
  const scopes = {
    ativas: {
      where: {
        status: [
          RESERVATION_STATUS.CONFIRMADA,
          RESERVATION_STATUS.EM_ANDAMENTO,
          RESERVATION_STATUS.PENDENTE_PAGAMENTO
        ]
      }
    },
    finalizadas: {
      where: {
        status: RESERVATION_STATUS.FINALIZADA
      },
      order: [['check_out', 'DESC']]
    },
    canceladas: {
      where: {
        status: RESERVATION_STATUS.CANCELADA
      },
      order: [['cancelado_em', 'DESC']]
    },
    pendentesPagamento: {
      where: {
        status: RESERVATION_STATUS.PENDENTE_PAGAMENTO,
        status_pagamento: 'pending'
      },
      order: [['horario_inicio_reserva', 'ASC']]
    },
    porEstacionamento: (estacionamentoId) => ({
      where: { estacionamento_id: estacionamentoId }
    }),
    porUsuario: (usuarioId) => ({
      where: { usuario_id: usuarioId }
    })
  };

  // Aplicar os scopes ao modelo
  Reserva.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    codigo_reserva: {
      type: DataTypes.STRING(20),
      unique: true,
      allowNull: false
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    },
    vaga_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'vagas',
        key: 'id'
      }
    },
    estacionamento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'estacionamentos',
        key: 'id'
      }
    },
    veiculo_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'veiculos',
        key: 'id'
      }
    },
    horario_inicio_reserva: {
      type: DataTypes.DATE,
      allowNull: false
    },
    horario_fim_reserva: {
      type: DataTypes.DATE,
      allowNull: false
    },
    check_in: {
      type: DataTypes.DATE,
      allowNull: true
    },
    check_out: {
      type: DataTypes.DATE,
      allowNull: true
    },
    tempo_estacionado_minutos: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    valor_total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    valor_pago: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM(Object.values(RESERVATION_STATUS)),
      allowNull: false,
      defaultValue: RESERVATION_STATUS.PENDENTE
    },
    status_pagamento: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    id_pagamento: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'ID do pagamento no gateway de pagamento'
    },
    dados_pagamento: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Dados adicionais do pagamento'
    },
    cancelado_em: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    },
    motivo_cancelamento: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gateway_pagamento: {
      type: DataTypes.ENUM(['asaas', 'pix', 'outro']),
      allowNull: true
    },
    metodo_pagamento: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    parcelas: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    },
    url_pagamento: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    data_expiracao_pagamento: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Campos para auditoria
    criado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    },
    atualizado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'usuarios',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Reserva',
    tableName: 'reservas',
    timestamps: false, // Disable timestamps since we're managing them manually
    underscored: true,
    scopes: scopes,
    defaultScope: {
      attributes: {
        exclude: ['created_at', 'updated_at', 'deleted_at']
      }
    }
  });

  // Hooks
  Reserva.beforeCreate(async (reserva, options) => {
    if (!reserva.codigo_reserva) {
      // Gera um código de reserva único
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 5);
      reserva.codigo_reserva = `${timestamp}${random}`.toUpperCase();
    }
  });

  // Validações
  Reserva.prototype.validarAntesDeSalvar = async function() {
    // Validar datas
    if (this.horario_fim_reserva <= this.horario_inicio_reserva) {
      throw new Error('A data de fim deve ser posterior à data de início');
    }

    // Validar status
    if (!Object.values(RESERVATION_STATUS).includes(this.status)) {
      throw new Error(`Status de reserva inválido: ${this.status}`);
    }

    // Validar se a vaga está disponível (apenas para reservas novas ou em confirmação)
    if (this.isNewRecord || this.changed('vaga_id') || this.changed('horario_inicio_reserva') || this.changed('horario_fim_reserva')) {
      const reservasConflitantes = await Reserva.count({
        where: {
          vaga_id: this.vaga_id,
          id: { [Op.ne]: this.id || null },
          [Op.or]: [
            // Início dentro de outra reserva
            {
              horario_inicio_reserva: { [Op.lt]: this.horario_fim_reserva },
              horario_fim_reserva: { [Op.gt]: this.horario_inicio_reserva }
            },
            // Fim dentro de outra reserva
            {
              horario_inicio_reserva: { [Op.lt]: this.horario_fim_reserva },
              horario_fim_reserva: { [Op.gt]: this.horario_inicio_reserva }
            },
            // Inclui outra reserva
            {
              horario_inicio_reserva: { [Op.gte]: this.horario_inicio_reserva },
              horario_fim_reserva: { [Op.lte]: this.horario_fim_reserva }
            }
          ],
          status: [
            RESERVATION_STATUS.CONFIRMADA,
            RESERVATION_STATUS.EM_ANDAMENTO,
            RESERVATION_STATUS.PENDENTE_PAGAMENTO
          ]
        }
      });


      if (reservasConflitantes > 0) {
        throw new Error('Já existe uma reserva para esta vaga no período selecionado');
      }
    }
  };

  // Hook beforeValidate
  Reserva.beforeValidate(async (reserva) => {
    await reserva.validarAntesDeSalvar();
  });

  // Métodos de instância
  Reserva.prototype.confirmarPagamento = async function(paymentData, transaction) {
    try {
      this.status = RESERVATION_STATUS.PAGAMENTO_APROVADO;
      this.status_pagamento = 'approved';
      this.dados_pagamento = this.dados_pagamento || {};
      Object.assign(this.dados_pagamento, paymentData);
      
      if (paymentData.id) {
        this.id_pagamento = paymentData.id;
      }
      
      if (paymentData.transaction_amount) {
        this.valor_pago = paymentData.transaction_amount;
      }
      
      await this.save({ transaction });
      return this;
    } catch (error) {
      logger.error('Erro ao confirmar pagamento da reserva:', {
        error: error.message,
        reservaId: this.id,
        stack: error.stack
      });
      throw error;
    }
  };

  Reserva.prototype.marcarComoUtilizada = async function(transaction) {
    try {
      this.status = RESERVATION_STATUS.EM_ANDAMENTO;
      this.check_in = new Date();
      await this.save({ transaction });
      return this;
    } catch (error) {
      logger.error('Erro ao marcar reserva como utilizada:', {
        error: error.message,
        reservaId: this.id,
        stack: error.stack
      });
      throw error;
    }
  };

  Reserva.prototype.finalizar = async function(transaction) {
    try {
      this.status = RESERVATION_STATUS.FINALIZADA;
      this.check_out = new Date();
      
      // Calcular tempo estacionado em minutos
      if (this.check_in) {
        const diffMs = this.check_out - this.check_in;
        this.tempo_estacionado_minutos = Math.round(diffMs / (1000 * 60));
      }
      
      await this.save({ transaction });
      return this;
    } catch (error) {
      logger.error('Erro ao finalizar reserva:', {
        error: error.message,
        reservaId: this.id,
        stack: error.stack
      });
      throw error;
    }
  };

  Reserva.prototype.cancelar = async function(usuarioId, motivo, transaction) {
    try {
      this.status = RESERVATION_STATUS.CANCELADA;
      this.cancelado_em = new Date();
      this.cancelado_por = usuarioId;
      this.motivo_cancelamento = motivo;
      
      await this.save({ transaction });
      return this;
    } catch (error) {
      logger.error('Erro ao cancelar reserva:', {
        error: error.message,
        reservaId: this.id,
        usuarioId,
        stack: error.stack
      });
      throw error;
    }
  };

  // Métodos estáticos adicionais
  Reserva.buscarPorCodigo = async function(codigo, options = {}) {
    try {
      return await Reserva.findOne({
        where: { codigo_reserva: codigo },
        ...options
      });
    } catch (error) {
      logger.error('Erro ao buscar reserva por código:', {
        error: error.message,
        codigo,
        stack: error.stack
      });
      throw error;
    }
  };

  Reserva.buscarAtivasPorUsuario = async function(usuarioId, options = {}) {
    try {
      return await Reserva.findAll({
        where: {
          usuario_id: usuarioId,
          status: [
            RESERVATION_STATUS.CONFIRMADA,
            RESERVATION_STATUS.EM_ANDAMENTO,
            RESERVATION_STATUS.PENDENTE_PAGAMENTO
          ]
        },
        order: [['horario_inicio_reserva', 'ASC']],
        ...options
      });
    } catch (error) {
      logger.error('Erro ao buscar reservas ativas do usuário:', {
        error: error.message,
        usuarioId,
        stack: error.stack
      });
      throw error;
    }
  };

  return Reserva;
};

// Exporta a constante RESERVATION_STATUS separadamente para uso fora do modelo
module.exports.RESERVATION_STATUS = RESERVATION_STATUS;
