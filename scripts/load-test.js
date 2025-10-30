import http from 'k6/http';
import { check, sleep } from 'k6';

// Configurações do teste
const BASE_URL = 'http://localhost:3000';
const AUTH_TOKEN = 'seu-token-jwt-aqui'; // Obter após login

// Opções do teste
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp-up para 20 usuários
    { duration: '1m', target: 50 },   // Aumentar para 50 usuários
    { duration: '30s', target: 0 },   // Ramp-down para 0 usuários
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% das requisições devem ser mais rápidas que 500ms
    http_req_failed: ['rate<0.1'],    // Menos de 10% de falhas
  },
};

// Teste de listagem de vagas
export function listarVagas() {
  const url = `${BASE_URL}/api/vagas`;
  const params = {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  
  const res = http.get(url, params);
  
  check(res, {
    'Lista de vagas retornou 200': (r) => r.status === 200,
    'Tempo de resposta < 500ms': (r) => r.timings.duration < 500,
  });
  
  return res;
}

// Teste de criação de reserva
export function criarReserva() {
  const url = `${BASE_URL}/api/reservas`;
  const payload = JSON.stringify({
    vaga_id: 1,
    data_inicio: new Date(Date.now() + 3600000).toISOString(), // 1 hora a partir de agora
    data_fim: new Date(Date.now() + 7200000).toISOString(),   // 2 horas a partir de agora
  });
  
  const params = {
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  
  const res = http.post(url, payload, params);
  
  check(res, {
    'Reserva criada com sucesso': (r) => r.status === 201,
  });
  
  return res;
}

// Função principal
export default function () {
  // Executar os testes
  listarVagas();
  
  // Apenas 30% das iterações criam reservas
  if (Math.random() < 0.3) {
    criarReserva();
  }
  
  // Esperar entre as requisições
  sleep(1);
}
