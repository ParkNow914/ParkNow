// Envolve o componente em uma IIFE para evitar conflitos de escopo
(function() {
  'use strict';
  
  // Usa React do escopo global (sem import/export)
  const { useState, useEffect, createElement: h, Fragment } = typeof React !== 'undefined' ? React : {};

  // Usa axios do escopo global
  const httpClient = typeof axios !== 'undefined' ? axios : null;

  // Usa toast do escopo global; fallback para console caso não exista
  const toastGlobal = typeof toast !== 'undefined' ? toast : {
    error: function (msg) { try { console.error(msg); } catch (_) {} },
    success: function (msg) { try { console.log(msg); } catch (_) {} }
  };

  const PixPaymentModal = ({ isOpen, onClose, reservaId, valorTotal, estacionamentoId, onPaymentConfirmed }) => {
  
  // Verifica se o React está disponível
  if (typeof React === 'undefined') {
    console.error('[PixPaymentModal] Erro: React não está disponível');
    return null;
  }
  
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutos em segundos

  useEffect(() => {
    if (isOpen && reservaId) {
      fetchPixData();
    } else if (!isOpen) {
      setPixData(null);
      setCountdown(300);
    }
  }, [isOpen, reservaId]);

  useEffect(() => {
    let timer;
    if (isOpen && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0) {
      // Tempo esgotado
      onClose();
    }
    return () => clearTimeout(timer);
  }, [countdown, isOpen]);

  const createReservaAndGetPixData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Extrai o ID real da vaga (remove o prefixo temp- se existir)
      const vagaId = reservaId.startsWith('temp-') ? reservaId.replace('temp-', '') : reservaId;
      
      // Cria a reserva com status pendente de pagamento
      if (!httpClient) { throw new Error('Cliente HTTP (axios) não disponível'); }
      const reservaResponse = await httpClient.post(
        '/api/reservas/com-pagamento',
        {
          vaga_id: parseInt(vagaId, 10), // Garante que é um número
          estacionamento_id: parseInt(estacionamentoId, 10), // Garante que é um número
          valor: parseFloat(valorTotal), // Garante que é um número
          data_entrada: new Date().toISOString(),
          data_saida: new Date(Date.now() + 3600000).toISOString(), // 1 hora depois
          metodo_pagamento: 'pix'
        },
        {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      // Atualiza o ID da reserva para o ID real (mantém localmente)
      const realReservaId = reservaResponse.data.data.id;
      
      // Busca os dados do PIX
      const pixResponse = await httpClient.get(`/api/reservas/${realReservaId}/pix`, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (pixResponse.data && pixResponse.data.data) {
        setPixData(pixResponse.data.data);
        setCountdown(300); // Reinicia a contagem regressiva
      } else {
        throw new Error('Dados do PIX não retornados corretamente');
      }
      
    } catch (error) {
      console.error('Erro ao processar reserva/PIX:', error);
      const errorMessage = (error && error.response && error.response.data && error.response.data.message)
        ? error.response.data.message
        : 'Erro ao processar pagamento. Tente novamente.';
      toastGlobal.error(errorMessage);
      onClose();
    } finally {
      setLoading(false);
    }
  };
  
  const fetchPixData = async () => {
    if (reservaId.startsWith('temp-')) {
      // Se for uma reserva temporária, cria a reserva primeiro
      await createReservaAndGetPixData();
    } else {
      // Se já for uma reserva real, busca apenas os dados do PIX
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!httpClient) { throw new Error('Cliente HTTP (axios) não disponível'); }
        const response = await httpClient.get(`/api/reservas/${reservaId}/pix`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPixData(response.data.data);
        setCountdown(300);
      } catch (error) {
        console.error('Erro ao buscar dados do PIX:', error);
        toastGlobal.error('Erro ao carregar dados do pagamento. Tente novamente.');
        onClose();
      } finally {
        setLoading(false);
      }
    }
  };

  const copyToClipboard = () => {
    if (!pixData) return;
    
    navigator.clipboard.writeText(pixData.chave_pix)
      .then(() => {
        setCopied(true);
        toastGlobal.success('Chave PIX copiada para a área de transferência!');
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => {
        console.error('Erro ao copiar chave PIX:', err);
        toastGlobal.error('Erro ao copiar chave PIX');
      });
  };

  if (!isOpen) {
    return null;
  }
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Usando React.createElement em vez de JSX
  return h('div', {
    className: 'pix-payment-modal-overlay',
    onClick: onClose,
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: isOpen ? 'flex' : 'none',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999
    }
  },
    h('div', {
      className: 'pix-payment-modal-content',
      onClick: e => e.stopPropagation(),
      style: {
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '25px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)'
      }
    },
      h('div', { className: 'p-6' },
        h('div', { className: 'flex justify-between items-center mb-4' },
          h('h3', { className: 'text-xl font-semibold text-gray-800' }, 'Pagamento via PIX'),
          h('button', {
            onClick: onClose,
            className: 'pix-payment-modal-close',
            'aria-label': 'Fechar modal'
          }, '×')
        ),
        loading
          ? h('div', { className: 'flex justify-center py-8' },
              h('div', { className: 'animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500' })
            )
          : h(Fragment, null,
              h('div', { className: 'mb-6' },
                h('div', { className: 'bg-blue-50 p-4 rounded-lg mb-4' },
                  h('p', { className: 'text-sm text-gray-600 mb-2' }, 'Tempo restante para pagamento:'),
                  h('p', { className: 'text-2xl font-bold text-blue-600' }, formatTime(countdown))
                ),
                h('div', { className: 'bg-gray-50 p-4 rounded-lg mb-4' },
                  h('p', { className: 'text-sm font-medium text-gray-700 mb-2' }, 'Valor:'),
                  h('p', { className: 'text-2xl font-bold text-gray-900' },
                    new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format((pixData && pixData.valor) ? pixData.valor : valorTotal)
                  )
                ),
                h('div', { className: 'bg-gray-50 p-4 rounded-lg mb-4' },
                  h('div', { className: 'flex justify-between items-center mb-2' },
                    h('p', { className: 'text-sm font-medium text-gray-700' }, 'Chave PIX:'),
                    h('button', {
                      onClick: copyToClipboard,
                      className: 'text-sm text-blue-600 hover:text-blue-800 flex items-center'
                    },
                      copied ? 'Copiado!' : 'Copiar',
                      h('svg', {
                        className: 'w-4 h-4 ml-1',
                        fill: 'none',
                        stroke: 'currentColor',
                        viewBox: '0 0 24 24'
                      },
                        h('path', {
                          strokeLinecap: 'round',
                          strokeLinejoin: 'round',
                          strokeWidth: '2',
                          d: 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3'
                        })
                      )
                    )
                  ),
                  h('div', { className: 'bg-white p-3 rounded border border-gray-200 break-all font-mono text-sm' },
                    (pixData && pixData.chave_pix) ? pixData.chave_pix : 'Carregando...'
                  ),
                  h('p', { className: 'mt-1 text-xs text-gray-500' },
                    'Tipo: ' + ((pixData && pixData.tipo_chave_pix) ? pixData.tipo_chave_pix : 'Carregando...')
                  )
                ),
                h('div', { className: 'bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4' },
                  h('div', { className: 'flex' },
                    h('div', { className: 'flex-shrink-0' },
                      h('svg', {
                        className: 'h-5 w-5 text-yellow-400',
                        fill: 'currentColor',
                        viewBox: '0 0 20 20'
                      },
                        h('path', {
                          fillRule: 'evenodd',
                          d: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
                          clipRule: 'evenodd'
                        })
                      )
                    ),
                    h('div', { className: 'ml-3' },
                      h('p', { className: 'text-sm text-yellow-700' },
                        'Após realizar o pagamento, o estacionamento irá confirmar manualmente o recebimento. Você receberá um e-mail quando a confirmação for concluída.'
                      )
                    )
                  )
                )
              ),
              h('div', { className: 'flex justify-end space-x-3' },
                h('button', {
                  type: 'button',
                  onClick: onClose,
                  className: 'px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50'
                }, 'Fechar'),
                h('button', {
                  type: 'button',
                  onClick: () => {
                    copyToClipboard();
                    onClose();
                  },
                  className: 'px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }, 'Copiar chave PIX e fechar')
              )
            )
      )
    )
  );
};

  // Expõe no escopo global para uso sem bundler
  window.PixPaymentModal = PixPaymentModal;

})(); // Fim da IIFE
