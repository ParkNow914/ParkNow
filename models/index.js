const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require('../config/db.postgres');

// Inicializa o Sequelize com a configuração apropriada
const sequelize = new Sequelize(
  process.env.PG_DATABASE || 'parknow_db',
  process.env.PG_USER || 'postgres',
  process.env.PG_PASSWORD || '91827364Now#',
  {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.PG_MAX_CONNECTIONS) || 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
);

// Objeto para armazenar todos os modelos
const db = {};

// Primeiro, carregar os modelos sem associações
const modelFiles = fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  });

// Ordem específica para carregar modelos que não dependem de outros
const coreModels = ['User.js', 'Usuario.js', 'Admin.js', 'Vaga.js'];
const otherModels = modelFiles.filter(file => !coreModels.includes(file));
const orderedModelFiles = [...coreModels, ...otherModels];

// Carregar os modelos
for (const file of orderedModelFiles) {
  try {
    if (!fs.existsSync(path.join(__dirname, file))) continue;
    
    const modelModule = require(path.join(__dirname, file));
    let model;
    
    if (modelModule.prototype && modelModule.prototype.constructor) {
      // Para classes ES6 como NotificacaoModel
      model = new modelModule();
    } else if (typeof modelModule === 'function') {
      // Para modelos que exportam uma função que recebe sequelize
      model = modelModule(sequelize, DataTypes);
    } else if (typeof modelModule.init === 'function') {
      // Para modelos que exportam um objeto com init
      model = modelModule.init(sequelize, DataTypes);
    } else if (modelModule.User) {
      // Para modelos que exportam { User, init }
      model = modelModule.init(sequelize, DataTypes);
    }
    
    if (model) {
      const modelName = model.constructor.name === 'NotificacaoModel' ? 'Notificacao' : model.name;
      db[modelName] = model;
    }
  } catch (error) {
    console.error(`Erro ao carregar o modelo do arquivo ${file}:`, error);
    throw error; // Parar em caso de erro
  }
}

// Configurar associações dos modelos
Object.keys(db).forEach(modelName => {
  try {
    if (typeof db[modelName].associate === 'function') {
      db[modelName].associate(db);
    }
  } catch (error) {
    console.error(`Erro ao configurar associações para o modelo ${modelName}:`, error);
    throw error; // Parar em caso de erro
  }
});

// Associações para pagamentos
if (db.MercadoPagoPayment && db.Reserva) {
  // A associação com Reserva está definida no próprio modelo MercadoPagoPayment
  // Uma reserva pode ter vários pagamentos do Mercado Pago
  db.Reserva.hasMany(db.MercadoPagoPayment, {
    foreignKey: 'external_reference',
    sourceKey: 'id',
    as: 'pagamentos_mercado_pago'
  });
}

// Associações para Logs
if (db.LogAdmin && db.Admin) {
  // Log de administração pertence a um admin
  db.LogAdmin.belongsTo(db.Admin, {
    foreignKey: 'admin_id',
    as: 'admin',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });

  // Um admin pode ter vários logs
  db.Admin.hasMany(db.LogAdmin, {
    foreignKey: 'admin_id',
    as: 'logs'
  });
}

// Associações para Admin e Usuário
if (db.Admin && db.Usuario) {
  // Relacionamento entre Admin e Usuário (um-para-um)
  // Um Admin está associado a um Usuário
  db.Admin.belongsTo(db.Usuario, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  // Um Usuário pode ter um registro de Admin
  db.Usuario.hasOne(db.Admin, {
    foreignKey: 'usuario_id',
    as: 'admin'
  });
}

// Associações para Logs de Veículos
if (db.LogVeiculo) {
  // Log de veículo pertence a um estacionamento
  if (db.Estacionamento) {
    db.LogVeiculo.belongsTo(db.Estacionamento, {
      foreignKey: 'estacionamento_id',
      as: 'estacionamento',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });

    db.Estacionamento.hasMany(db.LogVeiculo, {
      foreignKey: 'estacionamento_id',
      as: 'logs_veiculos'
    });
  }

  // Log de veículo pertence a uma vaga
  if (db.Vaga) {
    db.LogVeiculo.belongsTo(db.Vaga, {
      foreignKey: 'vaga_id',
      as: 'vaga',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    db.Vaga.hasMany(db.LogVeiculo, {
      foreignKey: 'vaga_id',
      as: 'logs_entrada_saida'
    });
  }
}

// Associações para Veículos
if (db.Veiculo && db.Usuario) {
  // Um veículo pertence a um usuário
  db.Veiculo.belongsTo(db.Usuario, {
    foreignKey: 'usuario_id',
    as: 'usuario',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  // Um usuário pode ter vários veículos
  db.Usuario.hasMany(db.Veiculo, {
    foreignKey: 'usuario_id',
    as: 'veiculos'
  });

  // Associação com Reserva
  if (db.Reserva) {
    db.Veiculo.hasMany(db.Reserva, {
      foreignKey: 'veiculo_id',
      as: 'reservas'
    });

    db.Reserva.belongsTo(db.Veiculo, {
      foreignKey: 'veiculo_id',
      as: 'veiculo',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  }
}


// Definir associações manuais se necessário
if (db.HorarioFuncionamento && db.Estacionamento) {
  // Um horário de funcionamento pertence a um estacionamento
  db.HorarioFuncionamento.belongsTo(db.Estacionamento, {
    foreignKey: 'estacionamento_id',
    as: 'estacionamento',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
  
  // Um estacionamento pode ter vários horários de funcionamento
  db.Estacionamento.hasMany(db.HorarioFuncionamento, {
    foreignKey: 'estacionamento_id',
    as: 'horarios_funcionamento'
  });
}

// Associações adicionais para Estacionamento
if (db.Estacionamento) {
  // Associação com Vagas já está definida no modelo Vaga.js
  // Não é necessário definir novamente aqui

  // Associação com Usuário (proprietário)
  if (db.Usuario) {
    db.Estacionamento.belongsTo(db.Usuario, {
      foreignKey: 'proprietario_id',
      as: 'proprietario',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    db.Usuario.hasMany(db.Estacionamento, {
      foreignKey: 'proprietario_id',
      as: 'estacionamentos'
    });
  }
}

if (db.Reserva && db.Estacionamento) {
  // As associações já estão definidas nos modelos
  // A associação com reservas está definida no modelo Estacionamento.js
  
  // Associações com Usuário
  if (db.Usuario) {
    db.Reserva.belongsTo(db.Usuario, {
      foreignKey: 'usuario_id',
      as: 'usuario',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    db.Usuario.hasMany(db.Reserva, {
      foreignKey: 'usuario_id',
      as: 'reservas'
    });
  }

  // Associações com Vaga
  if (db.Vaga) {
    // A associação belongsTo já está definida no modelo Reserva.js
    
    // Definindo apenas a associação hasMany para evitar duplicação
    db.Vaga.hasMany(db.Reserva, {
      foreignKey: 'vaga_id',
      as: 'reservas'
    });
  }

  // Associação com Veículo (se existir)
  if (db.Veiculo) {
    db.Reserva.belongsTo(db.Veiculo, {
      foreignKey: 'veiculo_id',
      as: 'veiculo',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
    
    db.Veiculo.hasMany(db.Reserva, {
      foreignKey: 'veiculo_id',
      as: 'reservas'
    });
  }

  // Associação com Pagamentos (MercadoPago) já está definida no modelo Reserva.js
}

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Testar a conexão
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexão com o banco de dados estabelecida com sucesso.');
  } catch (error) {
    console.error('Não foi possível conectar ao banco de dados:', error);
    process.exit(1);
  }
})();

module.exports = db;
