/**
 * Inicializa o modal de pagamento PIX manual
 * @param {Object} options - Opções de configuração
 * @param {Function} options.onPaymentInitiated - Callback chamado quando o pagamento é iniciado
 * @param {Function} options.onPaymentConfirmed - Callback chamado quando o pagamento é confirmado
 * @param {Function} options.onClose - Callback chamado quando o modal é fechado
 * @returns {Object} Instância do modal
 */
function initPixPaymentModal(options = {}) {
  // Verificar se o modal já foi carregado
  if (window.pixPaymentModal) {
    return window.pixPaymentModal;
  }

  // Carregar o modal manualmente se não estiver carregado
  if (typeof ManualPixPaymentModal === 'undefined') {
    console.error('ManualPixPaymentModal não encontrado. Certifique-se de incluir o arquivo ManualPixPaymentModal.js');
    return null;
  }

  // Criar instância do modal
  const modal = new ManualPixPaymentModal({
    onPaymentInitiated: (data) => {
      console.log('Pagamento PIX iniciado:', data);
      if (typeof options.onPaymentInitiated === 'function') {
        options.onPaymentInitiated(data);
      }
    },
    onPaymentConfirmed: (data) => {
      console.log('Pagamento PIX confirmado:', data);
      if (typeof options.onPaymentConfirmed === 'function') {
        options.onPaymentConfirmed(data);
      }
    },
    onClose: () => {
      console.log('Modal PIX fechado');
      if (typeof options.onClose === 'function') {
        options.onClose();
      }
    }
  });

  // Armazenar referência global
  window.pixPaymentModal = modal;
  return modal;
}

/**
 * Abre o modal de pagamento PIX
 * @param {string} estacionamentoId - ID do estacionamento
 * @param {Object} reservaData - Dados da reserva
 * @param {string} reservaData.id - ID da reserva
 * @param {number} reservaData.valor - Valor total da reserva
 * @param {string} reservaData.data_entrada - Data de entrada
 * @param {string} reservaData.data_saida - Data de saída
 * @param {string} [reservaData.veiculo_placa] - Placa do veículo
 * @param {string} [reservaData.vaga_id] - ID da vaga
 */
function openPixPaymentModal(estacionamentoId, reservaData) {
  if (!window.pixPaymentModal) {
    console.error('Modal de pagamento PIX não inicializado. Chame initPixPaymentModal() primeiro.');
    return;
  }
  
  window.pixPaymentModal.open(estacionamentoId, reservaData);
}

/**
 * Inicializa os listeners para botões de pagamento PIX
 * @param {Object} options - Opções de configuração
 * @param {string} [options.buttonSelector='.btn-pagamento-pix'] - Seletor dos botões de pagamento PIX
 * @param {Function} [options.onPaymentInitiated] - Callback chamado quando o pagamento é iniciado
 * @param {Function} [options.onPaymentConfirmed] - Callback chamado quando o pagamento é confirmado
 * @param {Function} [options.onClose] - Callback chamado quando o modal é fechado
 */
function setupPixPaymentButtons(options = {}) {
  const {
    buttonSelector = '.btn-pagamento-pix',
    onPaymentInitiated,
    onPaymentConfirmed,
    onClose
  } = options;

  // Inicializar o modal
  initPixPaymentModal({
    onPaymentInitiated,
    onPaymentConfirmed,
    onClose
  });

  // Adicionar listeners aos botões
  document.addEventListener('click', (e) => {
    const button = e.target.closest(buttonSelector);
    if (!button) return;

    e.preventDefault();
    
    const estacionamentoId = button.dataset.estacionamentoId;
    const reservaData = {
      id: button.dataset.reservaId,
      valor: parseFloat(button.dataset.valor || 0),
      data_entrada: button.dataset.dataEntrada,
      data_saida: button.dataset.dataSaida,
      veiculo_placa: button.dataset.veiculoPlaca,
      vaga_id: button.dataset.vagaId
    };

    if (!estacionamentoId || !reservaData.id) {
      console.error('Dados da reserva ou estacionamento não fornecidos');
      return;
    }

    openPixPaymentModal(estacionamentoId, reservaData);
  });
}

// Exportar funções para uso global
window.PixPayment = {
  init: initPixPaymentModal,
  open: openPixPaymentModal,
  setupButtons: setupPixPaymentButtons
};

// Inicialização automática se o DOM já estiver carregado
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupPixPaymentButtons();
  });
} else {
  setupPixPaymentButtons();
}
