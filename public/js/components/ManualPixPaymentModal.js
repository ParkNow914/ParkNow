class ManualPixPaymentModal {
  constructor(options) {
    this.options = {
      onPaymentInitiated: () => {},
      onPaymentConfirmed: () => {},
      onClose: () => {},
      ...options
    };
    
    this.modal = null;
    this.estacionamentoId = null;
    this.reservaData = null;
    this.pixData = null;
    this.isOpen = false;
    this.countdown = 300; // 5 minutos em segundos
    this.countdownInterval = null;
    
    this.init();
  }
  
  init() {
    // Criar o elemento modal
    this.modal = document.createElement('div');
    this.modal.className = 'pix-payment-modal';
    this.modal.style.display = 'none';
    this.modal.innerHTML = `
      <div class="pix-payment-modal__overlay"></div>
      <div class="pix-payment-modal__content">
        <button class="pix-payment-modal__close">&times;</button>
        <div class="pix-payment-modal__header">
          <h3>Pagamento via PIX</h3>
          <div class="pix-payment-modal__timer">Tempo restante: <span id="pix-countdown">05:00</span></div>
        </div>
        
        <div class="pix-payment-modal__body">
          <div class="pix-payment-details">
            <div class="pix-payment-details__amount">
              <span>Valor:</span>
              <strong id="pix-amount">R$ 0,00</strong>
            </div>
            
            <div class="pix-payment-details__info">
              <p>Escaneie o QR Code ou copie o código PIX abaixo:</p>
              
              <div class="pix-qr-code" id="pix-qr-code">
                <!-- QR Code será gerado aqui -->
                <div class="pix-qr-code__placeholder">Carregando QR Code...</div>
              </div>
              
              <div class="pix-key">
                <label>Chave PIX (CNPJ)</label>
                <div class="pix-key__value">
                  <span id="pix-key">Carregando...</span>
                  <button class="btn btn-sm btn-outline-secondary" id="copy-pix-key">
                    <i class="fas fa-copy"></i> Copiar
                  </button>
                </div>
              </div>
              
              <div class="pix-instructions">
                <p><strong>Como pagar:</strong></p>
                <ol>
                  <li>Abra o aplicativo do seu banco</li>
                  <li>Selecione a opção PIX</li>
                  <li>Escolha "Pagar com QR Code" ou "PIX Copia e Cola"</li>
                  <li>Copie o código acima e cole no app do seu banco</li>
                  <li>Confirme o pagamento</li>
                </ol>
              </div>
              
              <div class="pix-note">
                <p>Após o pagamento, o proprietário do estacionamento será notificado e confirmará manualmente seu pagamento.</p>
                <p>Você receberá um e-mail quando a reserva for confirmada.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="pix-payment-modal__footer">
          <button class="btn btn-secondary" id="pix-cancel-btn">Cancelar</button>
          <button class="btn btn-primary" id="pix-confirm-btn" disabled>
            <span class="spinner-border spinner-border-sm d-none" role="status" aria-hidden="true"></span>
            <span class="btn-text">Já efetuei o pagamento</span>
          </button>
        </div>
      </div>
    `;
    
    // Adicionar estilos
    this.addStyles();
    
    // Adicionar ao DOM
    document.body.appendChild(this.modal);
    
    // Configurar eventos
    this.setupEvents();
  }
  
  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .pix-payment-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .pix-payment-modal__overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1;
      }
      
      .pix-payment-modal__content {
        position: relative;
        background-color: #fff;
        border-radius: 8px;
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        z-index: 2;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      }
      
      .pix-payment-modal__header {
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .pix-payment-modal__header h3 {
        margin: 0;
        font-size: 1.25rem;
        color: #333;
      }
      
      .pix-payment-modal__timer {
        font-size: 0.9rem;
        color: #dc3545;
        font-weight: 500;
      }
      
      .pix-payment-modal__close {
        position: absolute;
        top: 10px;
        right: 15px;
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: #666;
      }
      
      .pix-payment-modal__body {
        padding: 20px;
      }
      
      .pix-payment-details__amount {
        text-align: center;
        margin-bottom: 20px;
      }
      
      .pix-payment-details__amount span {
        font-size: 1rem;
        color: #666;
      }
      
      .pix-payment-details__amount strong {
        display: block;
        font-size: 2rem;
        color: #28a745;
        margin-top: 5px;
      }
      
      .pix-qr-code {
        background: #fff;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin: 20px 0;
        text-align: center;
      }
      
      .pix-qr-code__placeholder {
        padding: 30px;
        background: #f8f9fa;
        border: 1px dashed #ddd;
        border-radius: 4px;
        color: #666;
      }
      
      .pix-key {
        margin: 20px 0;
      }
      
      .pix-key label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #333;
      }
      
      .pix-key__value {
        display: flex;
        gap: 10px;
      }
      
      .pix-key__value span {
        flex: 1;
        padding: 8px 12px;
        background: #f8f9fa;
        border: 1px solid #ddd;
        border-radius: 4px;
        word-break: break-all;
      }
      
      .pix-instructions {
        background: #f8f9fa;
        border-left: 4px solid #007bff;
        padding: 15px;
        margin: 20px 0;
        border-radius: 0 4px 4px 0;
      }
      
      .pix-instructions ol {
        padding-left: 20px;
        margin: 10px 0 0 0;
      }
      
      .pix-instructions li {
        margin-bottom: 5px;
      }
      
      .pix-note {
        font-size: 0.85rem;
        color: #666;
        margin: 20px 0;
        padding: 10px;
        background: #f0f7ff;
        border-radius: 4px;
        border-left: 3px solid #007bff;
      }
      
      .pix-payment-modal__footer {
        padding: 15px 20px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      
      @media (max-width: 576px) {
        .pix-payment-modal__content {
          width: 95%;
        }
        
        .pix-key__value {
          flex-direction: column;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
  
  setupEvents() {
    // Fechar modal
    this.modal.querySelector('.pix-payment-modal__close').addEventListener('click', () => this.close());
    this.modal.querySelector('.pix-payment-modal__overlay').addEventListener('click', () => this.close());
    this.modal.querySelector('#pix-cancel-btn').addEventListener('click', () => this.close());
    
    // Copiar chave PIX
    this.modal.querySelector('#copy-pix-key').addEventListener('click', () => this.copyPixKey());
    
    // Confirmar pagamento
    this.modal.querySelector('#pix-confirm-btn').addEventListener('click', () => this.confirmPayment());
    
    // Tecla ESC para fechar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }
  
  async open(estacionamentoId, reservaData) {
    if (this.isOpen) return;
    
    this.estacionamentoId = estacionamentoId;
    this.reservaData = reservaData;
    this.isOpen = true;
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Atualizar valor
    if (reservaData.valor) {
      this.modal.querySelector('#pix-amount').textContent = 
        `R$ ${parseFloat(reservaData.valor).toFixed(2).replace('.', ',')}`;
    }
    
    // Iniciar contagem regressiva
    this.startCountdown();
    
    try {
      // Buscar dados do PIX
      const response = await fetch(`/api/estacionamentos/${estacionamentoId}/pix-details`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Erro ao buscar dados do PIX');
      }
      
      const data = await response.json();
      this.pixData = data.data;
      
      // Atualizar UI
      this.modal.querySelector('#pix-key').textContent = this.pixData.chavePix;
      
      // Ativar botão de confirmação
      this.modal.querySelector('#pix-confirm-btn').disabled = false;
      
      // Chamar callback
      this.options.onPaymentInitiated({
        estacionamentoId,
        reservaData,
        pixData: this.pixData
      });
      
    } catch (error) {
      console.error('Erro ao carregar dados do PIX:', error);
      this.showError('Erro ao carregar dados do pagamento. Tente novamente.');
      this.close();
    }
  }
  
  close() {
    if (!this.isOpen) return;
    
    this.stopCountdown();
    this.isOpen = false;
    this.modal.style.display = 'none';
    document.body.style.overflow = '';
    
    // Limpar dados
    this.estacionamentoId = null;
    this.reservaData = null;
    this.pixData = null;
    
    // Resetar UI
    this.modal.querySelector('#pix-amount').textContent = 'R$ 0,00';
    this.modal.querySelector('#pix-key').textContent = 'Carregando...';
    this.modal.querySelector('#pix-confirm-btn').disabled = true;
    
    // Chamar callback
    this.options.onClose();
  }
  
  startCountdown() {
    this.countdown = 300; // 5 minutos
    this.updateCountdownDisplay();
    
    this.stopCountdown(); // Parar qualquer contagem existente
    
    this.countdownInterval = setInterval(() => {
      this.countdown--;
      this.updateCountdownDisplay();
      
      if (this.countdown <= 0) {
        this.stopCountdown();
        this.showError('Tempo esgotado. Por favor, inicie uma nova reserva.');
        setTimeout(() => this.close(), 3000);
      }
    }, 1000);
  }
  
  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
  
  updateCountdownDisplay() {
    if (!this.isOpen) return;
    
    const minutes = Math.floor(this.countdown / 60);
    const seconds = this.countdown % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const countdownElement = this.modal.querySelector('#pix-countdown');
    if (countdownElement) {
      countdownElement.textContent = display;
      
      // Mudar cor quando estiver acabando o tempo
      if (this.countdown <= 60) {
        countdownElement.style.color = '#dc3545';
        countdownElement.style.fontWeight = 'bold';
      } else if (this.countdown <= 120) {
        countdownElement.style.color = '#ffc107';
        countdownElement.style.fontWeight = 'bold';
      } else {
        countdownElement.style.color = '';
        countdownElement.style.fontWeight = '';
      }
    }
  }
  
  copyPixKey() {
    if (!this.pixData?.chavePix) return;
    
    navigator.clipboard.writeText(this.pixData.chavePix)
      .then(() => {
        const copyButton = this.modal.querySelector('#copy-pix-key');
        const originalText = copyButton.innerHTML;
        
        copyButton.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        copyButton.classList.add('btn-success');
        
        // Enviar notificação de cópia
        this.showSuccess('Chave PIX copiada com sucesso!');
        
        // Resetar botão após 2 segundos
        setTimeout(() => {
          copyButton.innerHTML = originalText;
          copyButton.classList.remove('btn-success');
        }, 2000);
      })
      .catch(err => {
        console.error('Erro ao copiar chave PIX:', err);
        this.showError('Não foi possível copiar a chave PIX');
      });
  }
  
  async confirmPayment() {
    if (!this.pixData) return;
    
    const confirmBtn = this.modal.querySelector('#pix-confirm-btn');
    const btnText = confirmBtn.querySelector('.btn-text');
    const spinner = confirmBtn.querySelector('.spinner-border');
    
    try {
      // Mostrar loading
      confirmBtn.disabled = true;
      btnText.textContent = 'Confirmando...';
      spinner.classList.remove('d-none');
      
      // Chamar API para confirmar pagamento
      const response = await fetch(`/api/pix/confirmar-pagamento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reservaId: this.reservaData.id,
          estacionamentoId: this.estacionamentoId
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao confirmar pagamento');
      }
      
      const data = await response.json();
      
      // Mostrar mensagem de sucesso
      this.showSuccess('Pagamento confirmado com sucesso! Aguarde a confirmação do estacionamento.');
      
      // Chamar callback
      this.options.onPaymentConfirmed({
        reservaId: this.reservaData.id,
        estacionamentoId: this.estacionamentoId,
        ...data.data
      });
      
      // Fechar modal após 2 segundos
      setTimeout(() => this.close(), 2000);
      
    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      this.showError(error.message || 'Erro ao confirmar pagamento. Tente novamente.');
      
      // Reativar botão
      confirmBtn.disabled = false;
      btnText.textContent = 'Já efetuei o pagamento';
      spinner.classList.add('d-none');
    }
  }
  
  showError(message) {
    // Implementar notificação de erro (pode usar toast, alert, etc.)
    console.error(message);
    alert(`Erro: ${message}`); // Substituir por um sistema de notificação melhor
  }
  
  showSuccess(message) {
    // Implementar notificação de sucesso
    console.log(message);
    alert(`Sucesso: ${message}`); // Substituir por um sistema de notificação melhor
  }
}

// Exportar para uso global
window.ManualPixPaymentModal = ManualPixPaymentModal;
