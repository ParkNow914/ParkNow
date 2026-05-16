const db = require('../models');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');
const {
  getHorariosByEstacionamento,
  setHorariosByEstacionamento,
  invalidateHorariosByEstacionamento
} = require('../services/cache/horarioFuncionamentoCache');

class HorarioFuncionamentoController {
  /**
   * Cria horários padrão para um estacionamento
   * @param {number} estacionamentoId - ID do estacionamento
   * @param {Object} [options] - Opções adicionais
   * @param {import('sequelize').Transaction} [options.transaction] - Transação do Sequelize (opcional)
   * @returns {Promise<boolean>} - True se os horários foram criados com sucesso
   */
  static async criarPadroes(estacionamentoId, options = {}) {
    // Se não houver transação fornecida, criar uma nova
    const isTransactionExternal = !!options.transaction;
    const transaction = isTransactionExternal 
      ? options.transaction 
      : await db.sequelize.transaction();
    
    try {
      const { HorarioFuncionamento } = db;
      
      // Verificar se o estacionamento existe
      const estacionamento = await db.Estacionamento.findByPk(estacionamentoId, {
        transaction,
        attributes: ['id']
      });
      
      if (!estacionamento) {
        throw new AppError('Estacionamento não encontrado', 404);
      }
      
      const diasDaSemana = [
        { 
          dia_semana: 0, 
          nome: 'Domingo', 
          aberto: false, 
          horario_abertura: null, 
          horario_fechamento: null 
        },
        { 
          dia_semana: 1, 
          nome: 'Segunda', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '18:00:00' 
        },
        { 
          dia_semana: 2, 
          nome: 'Terça', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '18:00:00' 
        },
        { 
          dia_semana: 3, 
          nome: 'Quarta', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '18:00:00' 
        },
        { 
          dia_semana: 4, 
          nome: 'Quinta', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '18:00:00' 
        },
        { 
          dia_semana: 5, 
          nome: 'Sexta', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '18:00:00' 
        },
        { 
          dia_semana: 6, 
          nome: 'Sábado', 
          aberto: true, 
          horario_abertura: '08:00:00', 
          horario_fechamento: '12:00:00' 
        }
      ];

      // Verificar se já existem horários para este estacionamento
      const existingHorarios = await HorarioFuncionamento.count({
        where: { estacionamento_id: estacionamentoId },
        transaction
      });

      if (existingHorarios > 0) {
        logger.warn(`Tentativa de criar horários padrão para estacionamento ${estacionamentoId} que já possui horários`);
        if (!isTransactionExternal) await transaction.rollback();
        return false;
      }

      // Inserir todos os dias da semana em uma única operação
      await HorarioFuncionamento.bulkCreate(
        diasDaSemana.map(dia => ({
          estacionamento_id: estacionamentoId,
          nome: dia.nome,
          dia_semana: dia.dia_semana,
          aberto: dia.aberto,
          horario_abertura: dia.horario_abertura,
          horario_fechamento: dia.horario_fechamento
        })),
        { transaction }
      );

      if (!isTransactionExternal) {
        await transaction.commit();
      }
      
      logger.info(`Horários padrão criados para o estacionamento ${estacionamentoId}`);
      return true;
      
    } catch (error) {
      if (!isTransactionExternal && transaction) {
        await transaction.rollback();
      }
      
      logger.error('Erro ao criar horários padrão:', {
        error: error.message,
        stack: error.stack,
        estacionamentoId
      });
      
      throw new AppError('Erro ao criar horários padrão do estacionamento', 500);
    }
  }

  /**
   * Busca horários de funcionamento de um estacionamento
   * @param {Object} req - Objeto de requisição do Express
   * @param {Object} res - Objeto de resposta do Express
   * @param {Function} next - Função para passar para o próximo middleware
   * @returns {Promise<void>}
   */
  /**
   * Verifica se o estacionamento está aberto no momento
   * @param {number} estacionamentoId - ID do estacionamento
   * @returns {Promise<{aberto: boolean, horarioAtual?: string, proximoHorario?: {abertura: string, dia: string}}>}
   */
  static async verificarSeEstaAberto(estacionamentoId) {
    try {
      const agora = new Date();
      const diaSemanaAtual = agora.getDay(); // 0 (Domingo) a 6 (Sábado)
      const horaAtual = agora.getHours().toString().padStart(2, '0') + ':' + 
                       agora.getMinutes().toString().padStart(2, '0') + ':' + 
                       agora.getSeconds().toString().padStart(2, '0');
      
      // Obter horários do cache se disponível
      let horarios = getHorariosByEstacionamento(estacionamentoId);
      
      if (!horarios) {
        // Se não estiver em cache, buscar do banco de dados
        horarios = await db.HorarioFuncionamento.findAll({
          where: { estacionamento_id: estacionamentoId },
          order: [['dia_semana', 'ASC']]
        });
        
        // Armazenar no cache por 1 hora
        setHorariosByEstacionamento(estacionamentoId, horarios, 3600);
      }
      
      if (!horarios || horarios.length === 0) {
        throw new AppError('Horários de funcionamento não encontrados para este estacionamento', 404);
      }
      
      // Encontrar o horário de hoje
      const horarioHoje = horarios.find(h => h.dia_semana === diaSemanaAtual);
      
      // Se não houver horário para hoje, verificar o próximo dia de funcionamento
      if (!horarioHoje || !horarioHoje.aberto) {
        return this.encontrarProximoDiaAberto(horarios, diaSemanaAtual);
      }
      
      // Verificar se está dentro do horário de funcionamento de hoje
      if (horaAtual >= horarioHoje.horario_abertura && 
          horaAtual <= horarioHoje.horario_fechamento) {
        return { aberto: true };
      }
      
      // Se estiver fechado, verificar se é porque ainda não abriu ou se já fechou
      if (horaAtual < horarioHoje.horario_abertura) {
        return {
          aberto: false,
          horarioAtual: 'fechado',
          proximoHorario: {
            abertura: horarioHoje.horario_abertura,
            dia: 'hoje'
          }
        };
      } else {
        // Já fechou, verificar o próximo dia de funcionamento
        return this.encontrarProximoDiaAberto(horarios, diaSemanaAtual);
      }
    } catch (error) {
      logger.error('Erro ao verificar se o estacionamento está aberto:', error);
      throw error;
    }
  }
  
  /**
   * Encontra o próximo dia de funcionamento
   * @private
   */
  static encontrarProximoDiaAberto(horarios, diaAtual) {
    // Ordenar os horários por dia da semana
    const horariosOrdenados = [...horarios].sort((a, b) => a.dia_semana - b.dia_semana);
    
    // Encontrar o próximo dia de funcionamento
    const proximoDia = horariosOrdenados.find(h => 
      h.dia_semana > diaAtual && h.aberto
    );
    
    // Se não encontrar nos próximos dias, procurar a partir do início da semana
    const primeiroDia = horariosOrdenados.find(h => h.dias_aberto && h.aberto);
    
    const proximoHorario = proximoDia || primeiroDia;
    const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    
    return {
      aberto: false,
      horarioAtual: 'fechado',
      proximoHorario: proximoHorario ? {
        abertura: proximoHorario.horario_abertura,
        dia: diasSemana[proximoHorario.dia_semana]
      } : undefined
    };
  }
  
  /**
   * Verifica o status atual de um estacionamento (aberto/fechado)
   * @param {Object} req - Objeto de requisição do Express
   * @param {Object} res - Objeto de resposta do Express
   * @param {Function} next - Função para passar para o próximo middleware
   * @returns {Promise<void>}
   */
  static async verificarStatusAtual(req, res, next) {
    try {
      const { estacionamentoId } = req.params;
      
      // Verificar se o estacionamento existe
      const estacionamento = await db.Estacionamento.findByPk(estacionamentoId, {
        attributes: ['id']
      });
      
      if (!estacionamento) {
        throw new AppError('Estacionamento não encontrado', 404);
      }
      
      // Verificar status atual
      const status = await this.verificarSeEstaAberto(estacionamentoId);
      
      // Formatar resposta
      const response = {
        aberto: status.aberto,
        horarioAtual: status.aberto ? 'aberto' : 'fechado',
      };
      
      if (status.proximoHorario) {
        response.proximoHorario = status.proximoHorario;
      }
      
      res.json(response);
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Busca os horários de funcionamento de um estacionamento
   * @param {Object} req - Objeto de requisição do Express
   * @param {Object} res - Objeto de resposta do Express
   * @param {Function} next - Função para passar para o próximo middleware
   * @returns {Promise<void>}
   */
  static async buscarPorEstacionamento(req, res, next) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const { estacionamentoId } = req.params;
      const { HorarioFuncionamento } = db;
      
      // Validar se o estacionamento existe
      const estacionamento = await db.Estacionamento.findByPk(estacionamentoId, {
        transaction,
        attributes: ['id']
      });
      
      if (!estacionamento) {
        throw new AppError('Estacionamento não encontrado', 404);
      }
      
      // Tentar obter do cache primeiro
      const _cacheKey = `estacionamento:${estacionamentoId}:horarios`;
      const cachedHorarios = getHorariosByEstacionamento(estacionamentoId);
      
      if (cachedHorarios) {
        await transaction.commit();
        return res.json(cachedHorarios);
      }
      
      // Buscar horários ordenados por dia da semana
      const horarios = await HorarioFuncionamento.findAll({
        where: { estacionamento_id: estacionamentoId },
        attributes: [
          'id', 
          'dia_semana', 
          'nome',
          'aberto', 
          'horario_abertura', 
          'horario_fechamento',
          'created_at',
          'updated_at'
        ],
        order: [['dia_semana', 'ASC']],
        transaction
      });
      
      // Se não houver horários, criar os padrões
      if (horarios.length === 0) {
        await this.criarPadroes(estacionamentoId, { transaction });
        // Buscar novamente após criar os padrões
        const horariosAtualizados = await HorarioFuncionamento.findAll({
          where: { estacionamento_id: estacionamentoId },
          attributes: [
            'id', 
            'dia_semana', 
            'nome',
            'aberto', 
            'horario_abertura', 
            'horario_fechamento',
            'created_at',
            'updated_at'
          ],
          order: [['dia_semana', 'ASC']],
          transaction
        });
        
        // Armazenar no cache
        setHorariosByEstacionamento(estacionamentoId, horariosAtualizados);
        
        await transaction.commit();
        return res.json(horariosAtualizados);
      }
      
      // Armazenar no cache
      setHorariosByEstacionamento(estacionamentoId, horarios);
      
      await transaction.commit();
      res.json(horarios);
      
    } catch (error) {
      await transaction.rollback();
      logger.error('Erro ao buscar horários do estacionamento:', {
        error: error.message,
        stack: error.stack,
        estacionamentoId: req.params.estacionamentoId
      });
      next(error);
    }
  }

  /**
   * Atualiza um horário de funcionamento
   * @param {Object} req - Objeto de requisição do Express
   * @param {Object} res - Objeto de resposta do Express
   * @param {Function} next - Função para passar para o próximo middleware
   * @returns {Promise<void>}
   */
  static async atualizar(req, res, next) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { aberto, horario_abertura, horario_fechamento } = req.body;
      const { HorarioFuncionamento } = db;
      
      logger.info('Iniciando atualização de horário', { 
        horarioId: id, 
        dados: { aberto, horario_abertura, horario_fechamento } 
      });
      
      // Invalida o cache para este estacionamento
      const horarioExistente = await HorarioFuncionamento.findByPk(id, { transaction });
      if (horarioExistente) {
        invalidateHorariosByEstacionamento(horarioExistente.estacionamento_id);
      }
      
      // Validar dados de entrada
      if (typeof aberto !== 'boolean') {
        throw new AppError('O campo "aberto" é obrigatório e deve ser um booleano', 400);
      }
      
      // Se estiver marcado como aberto, validar os horários
      if (aberto) {
        if (!horario_abertura || !horario_fechamento) {
          throw new AppError('Horários de abertura e fechamento são obrigatórios quando aberto=true', 400);
        }
        
        // Validar formato do horário (HH:MM:SS)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
        if (!timeRegex.test(horario_abertura) || !timeRegex.test(horario_fechamento)) {
          throw new AppError('Formato de horário inválido. Use HH:MM:SS', 400);
        }
        
        // Converter para Date para validar se o horário de abertura é anterior ao de fechamento
        const [horaAbertura, minAbertura] = horario_abertura.split(':');
        const [horaFechamento, minFechamento] = horario_fechamento.split(':');
        
        const dataAbertura = new Date();
        dataAbertura.setHours(parseInt(horaAbertura), parseInt(minAbertura), 0, 0);
        
        const dataFechamento = new Date();
        dataFechamento.setHours(parseInt(horaFechamento), parseInt(minFechamento), 0, 0);
        
        if (dataAbertura >= dataFechamento) {
          throw new AppError('O horário de abertura deve ser anterior ao horário de fechamento', 400);
        }
      }
      
      // Buscar horário com bloqueio para evitar condições de corrida
      const horario = await HorarioFuncionamento.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      
      if (!horario) {
        logger.warn('Tentativa de atualizar horário inexistente', { horarioId: id });
        throw new AppError('Horário de funcionamento não encontrado', 404);
      }
      
      // Preparar dados para atualização
      const dadosAtualizacao = { 
        aberto,
        updated_at: new Date()
      };
      
      // Se estiver aberto, atualiza os horários, senão define como null
      if (aberto) {
        dadosAtualizacao.horario_abertura = horario_abertura;
        dadosAtualizacao.horario_fechamento = horario_fechamento;
      } else {
        dadosAtualizacao.horario_abertura = null;
        dadosAtualizacao.horario_fechamento = null;
      }
      
      // Atualizar o registro
      await horario.update(dadosAtualizacao, { transaction });
      
      // Confirmar a transação
      await transaction.commit();
      
      logger.info('Horário atualizado com sucesso', { 
        horarioId: id,
        dadosAtualizados: dadosAtualizacao
      });
      
      // Buscar horário atualizado para retornar com todos os campos necessários
      const horarioAtualizado = await HorarioFuncionamento.findByPk(id, {
        attributes: [
          'id', 
          'estacionamento_id',
          'dia_semana', 
          'nome',
          'aberto', 
          'horario_abertura', 
          'horario_fechamento',
          'created_at',
          'updated_at'
        ]
      });
      
      res.json(horarioAtualizado);
      
    } catch (error) {
      await transaction.rollback();
      logger.error('Erro ao atualizar horário:', {
        error: error.message,
        stack: error.stack,
        horarioId: req.params.id,
        dados: req.body
      });
      
      // Se for um erro de validação do Sequelize, formatar a resposta
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const mensagensErro = error.errors.map(err => ({
          campo: err.path,
          mensagem: err.message
        }));
        return next(new AppError(`Erro de validação: ${JSON.stringify(mensagensErro)}`, 400));
      }
      
      next(error);
    }
  }
  
  /**
   * Atualiza vários horários de uma vez
   * @param {Object} req - Objeto de requisição do Express
   * @param {Object} res - Objeto de resposta do Express
   * @param {Function} next - Função para passar para o próximo middleware
   * @returns {Promise<void>}
   */
  static async atualizarVarios(req, res, next) {
    const transaction = await db.sequelize.transaction();
    
    try {
      const { estacionamentoId } = req.params;
      const { horarios } = req.body;
      const { HorarioFuncionamento } = db;
      
      // Invalida o cache para este estacionamento
      invalidateHorariosByEstacionamento(estacionamentoId);
      
      logger.info('Iniciando atualização em lote de horários', { 
        estacionamentoId,
        quantidadeHorarios: horarios ? horarios.length : 0
      });
      
      // Validar entrada
      if (!Array.isArray(horarios) || horarios.length === 0) {
        throw new AppError('O corpo da requisição deve conter um array de horários não vazio', 400);
      }
      
      // Validar cada horário
      for (const [index, horario] of horarios.entries()) {
        if (!horario || typeof horario !== 'object') {
          throw new AppError(`Horário na posição ${index} é inválido`, 400);
        }
        
        if (typeof horario.id !== 'number') {
          throw new AppError(`ID do horário na posição ${index} é obrigatório e deve ser um número`, 400);
        }
        
        if (typeof horario.aberto !== 'boolean') {
          throw new AppError(`O campo "aberto" no horário ${horario.id} é obrigatório e deve ser um booleano`, 400);
        }
        
        // Se estiver marcado como aberto, validar os horários
        if (horario.aberto) {
          if (!horario.horario_abertura || !horario.horario_fechamento) {
            throw new AppError(
              `Horários de abertura e fechamento são obrigatórios quando aberto=true para o horário ${horario.id}`, 
              400
            );
          }
          
          // Validar formato do horário (HH:MM:SS)
          const timeRegex = /^([01]\\d|2[0-3]):([0-5]\\d):([0-5]\\d)$/;
          if (!timeRegex.test(horario.horario_abertura) || !timeRegex.test(horario.horario_fechamento)) {
            throw new AppError(
              `Formato de horário inválido no horário ${horario.id}. Use HH:MM:SS`, 
              400
            );
          }
          
          // Validar se abertura é antes do fechamento
          const [horaAbertura, minAbertura] = horario.horario_abertura.split(':');
          const [horaFechamento, minFechamento] = horario.horario_fechamento.split(':');
          
          const dataAbertura = new Date();
          dataAbertura.setHours(parseInt(horaAbertura), parseInt(minAbertura), 0, 0);
          
          const dataFechamento = new Date();
          dataFechamento.setHours(parseInt(horaFechamento), parseInt(minFechamento), 0, 0);
          
          if (dataAbertura >= dataFechamento) {
            throw new AppError(
              `O horário de abertura deve ser anterior ao horário de fechamento no horário ${horario.id}`, 
              400
            );
          }
        }
      }
      
      // Coletar IDs para verificação de existência em lote
      const horariosIds = horarios.map(h => h.id);
      
      // Verificar se todos os horários existem e pertencem ao estacionamento
      const horariosExistentes = await HorarioFuncionamento.findAll({
        where: { 
          id: horariosIds,
          estacionamento_id: estacionamentoId
        },
        attributes: ['id'],
        transaction
      });
      
      const idsExistentes = new Set(horariosExistentes.map(h => h.id));
      const idsNaoEncontrados = horariosIds.filter(id => !idsExistentes.has(id));
      
      if (idsNaoEncontrados.length > 0) {
        throw new AppError(
          `Os seguintes horários não foram encontrados ou não pertencem a este estacionamento: ${idsNaoEncontrados.join(', ')}`,
          404
        );
      }
      
      // Atualizar cada horário em uma única transação
      const horariosAtualizados = [];
      
      for (const horario of horarios) {
        const dadosAtualizacao = { 
          aberto: horario.aberto,
          updated_at: new Date()
        };
        
        // Se estiver aberto, atualiza os horários, senão define como null
        if (horario.aberto) {
          dadosAtualizacao.horario_abertura = horario.horario_abertura;
          dadosAtualizacao.horario_fechamento = horario.horario_fechamento;
        } else {
          dadosAtualizacao.horario_abertura = null;
          dadosAtualizacao.horario_fechamento = null;
        }
        
        // Atualizar o registro no banco de dados
        const [updated] = await HorarioFuncionamento.update(dadosAtualizacao, {
          where: { 
            id: horario.id,
            estacionamento_id: estacionamentoId
          },
          transaction
        });
        
        if (updated !== 1) {
          logger.error(`Falha ao atualizar horário ${horario.id}`, {
            estacionamentoId,
            horarioId: horario.id,
            dadosAtualizacao
          });
          throw new AppError(`Falha ao atualizar horário ${horario.id}`, 500);
        }
        
        // Buscar horário atualizado para retornar com todos os campos
        const horarioAtualizado = await HorarioFuncionamento.findByPk(horario.id, {
          attributes: [
            'id', 
            'estacionamento_id',
            'dia_semana', 
            'nome',
            'aberto', 
            'horario_abertura', 
            'horario_fechamento',
            'created_at',
            'updated_at'
          ],
          transaction
        });
        
        if (horarioAtualizado) {
          horariosAtualizados.push(horarioAtualizado);
        } else {
          logger.warn(`Horário ${horario.id} atualizado mas não encontrado após atualização`, {
            estacionamentoId,
            horarioId: horario.id
          });
        }
      }
      
      // Confirmar a transação
      await transaction.commit();
      
      logger.info('Horários atualizados com sucesso', { 
        estacionamentoId,
        quantidadeAtualizada: horariosAtualizados.length 
      });
      
      // Ordenar os horários por dia da semana antes de retornar
      const horariosOrdenados = [...horariosAtualizados].sort((a, b) => 
        a.dia_semana - b.dia_semana
      );
      
      res.json(horariosOrdenados);
      
    } catch (error) {
      // Rollback em caso de erro
      await transaction.rollback();
      
      logger.error('Erro ao atualizar horários em lote:', {
        error: error.message,
        stack: error.stack,
        estacionamentoId: req.params.estacionamentoId,
        quantidadeHorarios: req.body.horarios ? req.body.horarios.length : 0
      });
      
      // Se for um erro de validação do Sequelize, formatar a resposta
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const mensagensErro = error.errors.map(err => ({
          campo: err.path,
          mensagem: err.message,
          valor: err.value,
          tipo: err.type
        }));
        return next(new AppError(`Erro de validação: ${JSON.stringify(mensagensErro)}`, 400));
      }
      
      // Se for um erro de banco de dados, não expor detalhes sensíveis
      if (error.name && error.name.includes('Sequelize')) {
        logger.error('Erro de banco de dados ao atualizar horários:', error);
        return next(new AppError('Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.', 500));
      }
      
      // Repassar outros erros para o middleware de tratamento de erros
      next(error);
    }
  }
}

module.exports = HorarioFuncionamentoController;
