/**
 * Calcula o status de ocupação de um estacionamento com base na capacidade e vagas ocupadas
 * @param {number} capacidade - Capacidade total do estacionamento
 * @param {number} vagasOcupadas - Número de vagas ocupadas
 * @returns {Object} - Objeto com status e cor do pin
 */
function calcularStatusOcupacao(capacidade, vagasOcupadas) {
  if (capacidade === 0 || capacidade === null || capacidade === undefined) {
    return {
      status: 'indisponivel',
      cor: '#808080', // Cinza
      descricao: 'Indisponível',
      percentualOcupacao: 100
    };
  }

  const vagasLivres = capacidade - vagasOcupadas;
  const percentualOcupacao = (vagasOcupadas / capacidade) * 100;

  if (vagasLivres <= 0) {
    return {
      status: 'lotado',
      cor: '#FF0000', // Vermelho
      descricao: 'Lotado',
      percentualOcupacao: 100
    };
  } else if (percentualOcupacao >= 80) {
    return {
      status: 'quase_lotado',
      cor: '#FFA500', // Laranja
      descricao: 'Quase lotado',
      percentualOcupacao: Math.round(percentualOcupacao)
    };
  } else if (percentualOcupacao >= 50) {
    return {
      status: 'moderado',
      cor: '#FFD700', // Amarelo
      descricao: 'Moderado',
      percentualOcupacao: Math.round(percentualOcupacao)
    };
  } else {
    return {
      status: 'tranquilo',
      cor: '#008000', // Verde
      descricao: 'Tranquilo',
      percentualOcupacao: Math.round(percentualOcupacao)
    };
  }
}

/**
 * Verifica se o estacionamento está fechado ou em manutenção
 * @param {Object} estacionamento - Objeto do estacionamento
 * @returns {boolean} - True se estiver fechado/em manutenção
 */
function estaFechadoOuManutencao(estacionamento) {
  const agora = new Date();
  const diaSemana = agora.getDay(); // 0 (Domingo) a 6 (Sábado)
  
  // Verificar se está em manutenção
  if (estacionamento.em_manutencao) {
    return true;
  }
  
  // Verificar horário de funcionamento
  if (estacionamento.horariosFuncionamento && estacionamento.horariosFuncionamento.length > 0) {
    const horarioHoje = estacionamento.horariosFuncionamento.find(h => h.dia_semana === diaSemana);
    
    if (!horarioHoje || !horarioHoje.aberto) {
      return true; // Fechado no dia de hoje
    }
    
    const horaAtual = agora.getHours() * 100 + agora.getMinutes();
    const [horaAbertura, minAbertura] = horarioHoje.horario_abertura.split(':').map(Number);
    const [horaFechamento, minFechamento] = horarioHoje.horario_fechamento.split(':').map(Number);
    
    const horarioAbertura = horaAbertura * 100 + minAbertura;
    const horarioFechamento = horaFechamento * 100 + minFechamento;
    
    if (horaAtual < horarioAbertura || horaAtual > horarioFechamento) {
      return true; // Fora do horário de funcionamento
    }
  }
  
  return false;
}

module.exports = {
  calcularStatusOcupacao,
  estaFechadoOuManutencao
};
