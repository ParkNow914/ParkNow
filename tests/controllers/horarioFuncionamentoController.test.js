const { expect } = require('chai');
const sinon = require('sinon');
const { HorarioFuncionamento } = require('../../models');
const { Estacionamento } = require('../../models');
const { AppError } = require('../../utils/AppError');
const db = require('../../models');

// Mock the cache module
const cache = require('node-cache');
const horarioFuncionamentoCache = require('../../services/cache/horarioFuncionamentoCache');

// Import the controller
const controller = require('../../controllers/horarioFuncionamentoController');

describe('HorarioFuncionamentoController', () => {
  let sandbox;
  let transaction;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    transaction = { commit: sandbox.stub().resolves(), rollback: sandbox.stub().resolves() };
    sandbox.stub(db.sequelize, 'transaction').resolves(transaction);
    
    // Mock the cache
    sandbox.stub(horarioFuncionamentoCache, 'getHorariosByEstacionamento');
    sandbox.stub(horarioFuncionamentoCache, 'setHorariosByEstacionamento');
    sandbox.stub(horarioFuncionamentoCache, 'invalidateHorariosByEstacionamento');
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('verificarStatusAtual', () => {
    it('deve retornar o status do estacionamento', async () => {
      const req = { 
        params: { estacionamentoId: 1 },
        user: { id: 1 }
      };
      const res = { json: sandbox.stub() };
      const next = sandbox.stub();
      
      // Mock Estacionamento.findByPk
      sandbox.stub(Estacionamento, 'findByPk').resolves({ id: 1 });
      
      // Mock verificarSeEstaAberto
      sandbox.stub(controller, 'verificarSeEstaAberto').resolves({
        aberto: true
      });
      
      await controller.verificarStatusAtual(req, res, next);
      
      expect(Estacionamento.findByPk.calledOnce).to.be.true;
      expect(controller.verificarSeEstaAberto.calledOnceWith(1)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0]).to.deep.equal({
        aberto: true,
        horarioAtual: 'aberto'
      });
    });
    
    it('deve retornar erro 404 se o estacionamento não existir', async () => {
      const req = { 
        params: { estacionamentoId: 999 },
        user: { id: 1 }
      };
      const res = { json: sandbox.stub() };
      const next = sandbox.stub();
      
      // Mock Estacionamento.findByPk para retornar null
      sandbox.stub(Estacionamento, 'findByPk').resolves(null);
      
      await controller.verificarStatusAtual(req, res, next);
      
      expect(next.calledOnce).to.be.true;
      expect(next.firstCall.args[0]).to.be.an.instanceOf(AppError);
      expect(next.firstCall.args[0].statusCode).to.equal(404);
    });
  });
  
  describe('verificarSeEstaAberto', () => {
    it('deve retornar aberto=true quando estiver dentro do horário', async () => {
      // Mock current date to be a Monday at 14:30
      const clock = sinon.useFakeTimers(new Date(2025, 5, 23, 14, 30, 0));
      
      // Mock getHorariosByEstacionamento to return test data
      const horariosTeste = [
        { 
          id: 1, 
          estacionamento_id: 1, 
          dia_semana: 1, // Monday
          nome: 'Segunda-feira',
          aberto: true,
          horario_abertura: '09:00:00',
          horario_fechamento: '18:00:00'
        },
        // Add other days as needed
      ];
      
      horarioFuncionamentoCache.getHorariosByEstacionamento.returns(horariosTeste);
      
      const result = await controller.verificarSeEstaAberto(1);
      
      expect(result.aberto).to.be.true;
      
      clock.restore();
    });
    
    it('deve retornar aberto=false com próximo horário quando estiver fechado', async () => {
      // Mock current date to be a Sunday at 20:00
      const clock = sinon.useFakeTimers(new Date(2025, 5, 22, 20, 0, 0));
      
      // Mock getHorariosByEstacionamento to return test data
      const horariosTeste = [
        { 
          id: 1, 
          estacionamento_id: 1, 
          dia_semana: 1, // Monday
          nome: 'Segunda-feira',
          aberto: true,
          horario_abertura: '09:00:00',
          horario_fechamento: '18:00:00'
        },
        // Add other days as needed
      ];
      
      horarioFuncionamentoCache.getHorariosByEstacionamento.returns(horariosTeste);
      
      const result = await controller.verificarSeEstaAberto(1);
      
      expect(result.aberto).to.be.false;
      expect(result.horarioAtual).to.equal('fechado');
      expect(result.proximoHorario).to.exist;
      expect(result.proximoHorario.dia).to.equal('Segunda');
      
      clock.restore();
    });
  });
  
  // Add more test cases for other methods
});
