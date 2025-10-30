'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS horarios_funcionamento (
        id SERIAL PRIMARY KEY,
        estacionamento_id INTEGER NOT NULL,
        dia_semana INTEGER NOT NULL,
        aberto BOOLEAN NOT NULL DEFAULT true,
        horario_abertura TIME,
        horario_fechamento TIME,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (estacionamento_id) REFERENCES estacionamentos(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT chk_horario_valido CHECK (
          (aberto = false) OR 
          (aberto = true AND horario_abertura IS NOT NULL AND horario_fechamento IS NOT NULL)
        ),
        CONSTRAINT unq_estacionamento_dia UNIQUE (estacionamento_id, dia_semana)
      );
      
      COMMENT ON TABLE horarios_funcionamento IS 'Tabela de horários de funcionamento dos estacionamentos';
      COMMENT ON COLUMN horarios_funcionamento.id IS 'ID único do horário de funcionamento';
      COMMENT ON COLUMN horarios_funcionamento.estacionamento_id IS 'ID do estacionamento';
      COMMENT ON COLUMN horarios_funcionamento.dia_semana IS 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)';
      COMMENT ON COLUMN horarios_funcionamento.aberto IS 'Se o estacionamento está aberto neste dia';
      COMMENT ON COLUMN horarios_funcionamento.horario_abertura IS 'Horário de abertura (HH:MM:SS)';
      COMMENT ON COLUMN horarios_funcionamento.horario_fechamento IS 'Horário de fechamento (HH:MM:SS)';
      COMMENT ON COLUMN horarios_funcionamento.created_at IS 'Data de criação do registro';
      COMMENT ON COLUMN horarios_funcionamento.updated_at IS 'Data da última atualização do registro';
    `);
    
    // Criar função para atualizar o updated_at
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Criar trigger para atualizar o updated_at
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS update_horarios_funcionamento_updated_at ON horarios_funcionamento;
      CREATE TRIGGER update_horarios_funcionamento_updated_at
      BEFORE UPDATE ON horarios_funcionamento
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Remover trigger e função
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS update_horarios_funcionamento_updated_at ON horarios_funcionamento;
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);
    
    // Remover a tabela
    await queryInterface.dropTable('horarios_funcionamento');
  }
};
