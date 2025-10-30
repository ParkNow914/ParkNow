const request = require('supertest');
const app = require('../app');
const { expect } = require('chai');
const redis = require('ioredis');
const logger = require('../utils/logger');

// Mock do Redis para testes
jest.mock('ioredis');

// Mock do logger para evitar logs durante os testes
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Email Validation API', () => {
  let server;
  
  beforeAll((done) => {
    // Inicia o servidor em uma porta aleatória para testes
    server = app.listen(0, 'localhost', done);
  });
  
  afterAll((done) => {
    // Fecha o servidor após os testes
    server.close(done);
  });
  
  beforeEach(() => {
    // Limpa todos os mocks antes de cada teste
    jest.clearAllMocks();
  });
  
  describe('POST /api/email/validate', () => {
    it('deve validar um e-mail válido', async () => {
      const response = await request(server)
        .post('/api/email/validate')
        .send({ email: 'test@example.com' })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.have.property('valid', true);
      expect(response.body).to.have.property('message', 'E-mail válido');
      expect(response.body).to.have.property('domain', 'example.com');
    });
    
    it('deve rejeitar um e-mail inválido', async () => {
      const response = await request(server)
        .post('/api/email/validate')
        .send({ email: 'invalid-email' })
        .expect('Content-Type', /json/)
        .expect(400);
      
      expect(response.body).to.have.property('success', false);
      expect(response.body).to.have.property('error', 'invalid_input');
    });
    
    it('deve rejeitar e-mails descartáveis quando não permitidos', async () => {
      const response = await request(server)
        .post('/api/email/validate')
        .send({ 
          email: 'test@mailinator.com',
          options: { allowDisposable: false }
        })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.have.property('valid', false);
      expect(response.body).to.have.property('reason', 'disposable_email');
    });
    
    it('deve permitir e-mails descartáveis quando configurado', async () => {
      const response = await request(server)
        .post('/api/email/validate')
        .send({ 
          email: 'test@mailinator.com',
          options: { allowDisposable: true }
        })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.have.property('valid', true);
    });
  });
  
  describe('POST /api/email/validate/batch', () => {
    it('deve validar múltiplos e-mails em lote', async () => {
      const emails = [
        'test1@example.com',
        'test2@example.com',
        'invalid-email'
      ];
      
      const response = await request(server)
        .post('/api/email/validate/batch')
        .send({ emails })
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('count', 3);
      expect(response.body.results).to.be.an('array').with.lengthOf(3);
      expect(response.body.results[0]).to.have.property('valid', true);
      expect(response.body.results[2]).to.have.property('valid', false);
    });
    
    it('deve limitar o número de e-mails em um lote', async () => {
      const emails = Array(150).fill('test@example.com');
      
      const response = await request(server)
        .post('/api/email/validate/batch')
        .send({ emails })
        .expect('Content-Type', /json/)
        .expect(400);
      
      expect(response.body).to.have.property('success', false);
    });
  });
  
  describe('Rate Limiting', () => {
    it('deve limitar requisições excessivas', async () => {
      // Faz várias requisições em sequência para testar o rate limiting
      const requests = Array(10).fill().map(() => 
        request(server)
          .post('/api/email/validate')
          .send({ email: 'test@example.com' })
      );
      
      const responses = await Promise.all(requests);
      
      // Verifica se alguma resposta foi limitada (deve ser a última)
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).to.be.true;
    });
  });
  
  describe('Cache', () => {
    it('deve usar o cache para requisições repetidas', async () => {
      const email = 'cache-test@example.com';
      
      // Primeira requisição (não deve estar em cache)
      const firstResponse = await request(server)
        .post('/api/email/validate')
        .send({ email })
        .expect(200);
      
      expect(firstResponse.headers['x-cache']).to.equal('MISS');
      
      // Segunda requisição (deve estar em cache)
      const secondResponse = await request(server)
        .post('/api/email/validate')
        .send({ email })
        .expect(200);
      
      expect(secondResponse.headers['x-cache']).to.equal('HIT');
      expect(secondResponse.body.cached).to.be.true;
    });
  });
});
