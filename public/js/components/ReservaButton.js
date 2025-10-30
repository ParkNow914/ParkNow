// Envolve o componente em uma IIFE para evitar conflitos de escopo
(function() {
  'use strict';
  
  // Usa React do escopo global
  const { useState, createElement: h } = typeof React !== 'undefined' ? React : {};

  // Usa axios global
  const httpClient = typeof axios !== 'undefined' ? axios : null;

  // Usa toast global com fallback
  const toastGlobal = typeof toast !== 'undefined' ? toast : {
    error: function (msg) { try { console.error(msg); } catch (_) {} },
    success: function (msg) { try { console.log(msg); } catch (_) {} }
  };

  // Usa PixPaymentModal do escopo global
  const PixPaymentModal = typeof window !== 'undefined' ? window.PixPaymentModal : null;

  const ReservaButton = ({ vagaId, estacionamentoId, valor, onReservaSuccess }) => {
  
  // Verifica se o React está disponível
  if (typeof React === 'undefined') {
    console.error('[ReservaButton] React não está disponível');
    return null;
  }
  
  const [showPixModal, setShowPixModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reservaId, setReservaId] = useState(null);

  const handleReservarClick = async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      toastGlobal.error('Você precisa estar logado para fazer uma reserva');
      return;
    }
    
    try {
      // Valida se o ID da vaga é válido
      if (!vagaId) {
        throw new Error('ID da vaga não fornecido');
      }
      
      // Abre o modal do PIX com o ID da vaga
      setReservaId(`temp-${vagaId}`);
      setShowPixModal(true);
    } catch (error) {
      console.error('Erro ao iniciar reserva:', error);
      toastGlobal.error('Erro ao iniciar a reserva. Tente novamente.');
    }
  };

  const handlePixModalClose = () => {
    setShowPixModal(false);
    if (onReservaSuccess) {
      onReservaSuccess();
    }
  };
  
  // Usando React.createElement em vez de JSX
  return h('div', {
    style: { position: 'relative' },
    'data-testid': 'reserva-button-container'
  },
    h('button', {
      id: 'botao-reservar',
      onClick: handleReservarClick,
      disabled: loading,
      className: `w-full py-2 px-4 rounded-md text-white font-medium ${
        loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`,
      style: { position: 'relative', zIndex: 10 }
    }, loading ? 'Processando...' : 'Reservar Agora'),
    h('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: showPixModal ? 'flex' : 'none',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }
    },
      showPixModal && reservaId && h(PixPaymentModal, {
        key: reservaId, // Forçar recriação do modal quando o ID mudar
        isOpen: showPixModal,
        onClose: handlePixModalClose,
        reservaId: reservaId,
        valorTotal: valor,
        estacionamentoId: estacionamentoId
      })
    )
  );
};

  // Expõe no escopo global para ser usado por initReact.js
  window.ReservaButton = ReservaButton;

})(); // Fim da IIFE
