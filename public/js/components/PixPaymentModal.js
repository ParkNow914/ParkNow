// Componente vanilla para exibir o modal de pagamento PIX
(function(window, document) {
  'use strict';

  const DEFAULT_MODAL_ID = 'pixPaymentModal';
  const noop = () => {};

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toDataUri(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return trimmed.startsWith('data:image') ? trimmed : `data:image/png;base64,${trimmed}`;
  }

  function formatCurrency(value) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? '0.00' : numeric.toFixed(2);
  }

  function normalizePixPaymentData(raw = {}) {
    const base64Image = raw.qr_code_base64 || raw.qrCodeBase64 || raw.qr_code_image || raw.qrCodeImage;
    let qrImage = toDataUri(base64Image);

    if (!qrImage && raw.qr_code && /^data:image|^https?:\/\//i.test(String(raw.qr_code))) {
      qrImage = raw.qr_code;
    }

    const pixCopyValue = raw.qr_code_text
      || raw.qrCodeText
      || raw.qr_code_payload
      || raw.pix_qr_code_text
      || raw.pix_qr_code
      || raw.codigo_pix
      || raw.codigoPix
      || raw.chave_pix
      || raw.chavePix
      || '';

    const localPaymentId = raw.pagamento_id
      ?? raw.payment_local_id
      ?? (Number.isFinite(raw.id) ? raw.id : null);

    const gatewayPaymentId = raw.gateway_payment_id
      ?? raw.gatewayPaymentId
      ?? raw.payment_id
      ?? null;

    return {
      qr_code: qrImage,
      qr_code_text: pixCopyValue,
      reserva_id: raw.reserva_id || raw.reservaId || null,
      pagamento_id: localPaymentId ?? null,
      gateway_payment_id: gatewayPaymentId ?? null,
      payment_id: localPaymentId ?? gatewayPaymentId ?? null,
      valor: raw.valor ?? raw.valor_total ?? null,
      split: raw.split || raw.splitInfo || null,
      expira_em: raw.expira_em || raw.data_expiracao || null,
      chave_pix: raw.chave_pix || raw.chavePix || null,
      nome_titular: raw.nome_titular || raw.titular || null
    };
  }

  function buildSplitMarkup(data) {
    if (!data.split) return '';
    const split = data.split;
    const total = formatCurrency(split.total ?? data.valor);
    const comissao = formatCurrency(split.comissao_plataforma);
    const valorEstacionamento = formatCurrency(split.valor_estacionamento);
    const percentual = split.percentual_plataforma ?? split.percentual ?? '--';
    const percentualEst = split.percentual_estacionamento ?? '--';

    return `
      <div class="card border-info mb-3" style="font-size: 0.9rem;">
        <div class="card-header bg-info text-white py-2">
          <i class="fas fa-info-circle me-1"></i> Detalhamento do Pagamento
        </div>
        <div class="card-body p-2">
          <div class="d-flex justify-content-between mb-1">
            <span><strong>Valor Total:</strong></span>
            <span class="text-success"><strong>R$ ${total}</strong></span>
          </div>
          <hr class="my-1">
          <div class="d-flex justify-content-between mb-1">
            <span class="text-muted small">Taxa ParkNow (${percentual}%):</span>
            <span class="text-muted small">R$ ${comissao}</span>
          </div>
          <div class="d-flex justify-content-between">
            <span class="text-muted small">Estacionamento (${percentualEst}%):</span>
            <span class="text-muted small">R$ ${valorEstacionamento}</span>
          </div>
        </div>
      </div>
    `;
  }

  function buildModalMarkup(data) {
    const qrImageSrc = data.qr_code
      || (data.qr_code_text
        ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.qr_code_text)}`
        : '');

    const qrCodeMarkup = qrImageSrc
      ? `<img src="${qrImageSrc}"
               alt="QR Code PIX"
               class="img-fluid"
               style="max-width: min(250px, 80vw); height: auto; border: 2px solid #004080; border-radius: 8px; padding: 10px; background: white;">`
      : `<div class="text-muted small">QR Code indisponível. Copie o código PIX abaixo.</div>`;

    const pixInputValue = escapeHtml(data.qr_code_text || '');
    const copyDisabledAttr = data.qr_code_text ? '' : 'disabled aria-disabled="true"';

    return `
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style="max-width: 500px;">
        <div class="modal-content" style="max-height: 90vh;">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="fas fa-qrcode me-2"></i>Pagamento via PIX
            </h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Fechar">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body" style="overflow-y: auto; max-height: calc(90vh - 140px);">
            <div class="text-center">
              <p class="lead mb-3">Escaneie o QR Code para pagar</p>
              <div class="qr-code-container mb-3" style="display: flex; justify-content: center; align-items: center;">
                ${qrCodeMarkup}
              </div>
              ${buildSplitMarkup(data)}
              <div class="mb-3">
                <label class="form-label small text-muted">Ou copie o código PIX:</label>
                <div class="input-group">
                  <input type="text"
                         id="pixCode"
                         class="form-control form-control-sm"
                         value="${pixInputValue}"
                         placeholder="${data.qr_code_text ? '' : 'Código PIX indisponível'}"
                         readonly
                         style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis;">
                  <button class="btn btn-outline-primary btn-sm"
                          type="button"
                          id="copyPixCode"
                          data-reserva-id="${data.reserva_id || ''}"
                          ${copyDisabledAttr}>
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
              <div class="alert alert-warning d-flex align-items-center py-2" role="alert" style="font-size: 0.9rem;">
                <i class="fas fa-clock me-2"></i>
                <div>
                  <strong>Atenção:</strong> Você tem <strong>30 minutos</strong> para realizar o pagamento.
                </div>
              </div>
              <div id="pixCopyFeedback" class="alert alert-success py-2" style="display: none; font-size: 0.9rem;">
                <i class="fas fa-check-circle me-1"></i> Código copiado com sucesso!
              </div>
            </div>
          </div>
          <div class="modal-footer d-flex justify-content-between flex-wrap">
            <button type="button" class="btn btn-secondary btn-sm mb-1" data-dismiss="modal">
              <i class="fas fa-times me-1"></i>Fechar
            </button>
            <button type="button" class="btn btn-success btn-sm mb-1" id="confirmarPagamento">
              <i class="fas fa-check me-1"></i>Já efetuei o pagamento
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachEvents(modalId, data, options) {
    const $ = window.jQuery;
    const selector = `#${modalId}`;
    if (!$ || !$.fn || !$.fn.modal) {
      console.warn('[PixPaymentModal] jQuery/Bootstrap não encontrados. Eventos avançados foram desativados.');
      return;
    }

    $(`${selector} #copyPixCode`).on('click', async function() {
      if (!data.qr_code_text) return;

      const input = document.querySelector(`${selector} #pixCode`);
      if (input) {
        input.focus();
        input.select();
        document.execCommand('copy');
      } else if (navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.qr_code_text);
        } catch (err) {
          console.error('Erro ao copiar PIX:', err);
        }
      }

      const originalHtml = $(this).html();
      $(this).html('<i class="fas fa-check"></i> Copiado!');
      $('#pixCopyFeedback').fadeIn();

      try {
        options.onCopy(data);
      } finally {
        setTimeout(() => $(this).html(originalHtml), 2000);
      }
    });

    $(`${selector} #confirmarPagamento`).on('click', () => {
      options.onConfirm(data);
      if (options.closeOnConfirm !== false) {
        $(selector).modal('hide');
      }
    });

    $(selector).on('hidden.bs.modal', function() {
      $(this).remove();
      options.onClose(data);
    });
  }

  function mountModal(html, modalId) {
    const existing = document.getElementById(modalId);
    if (existing) {
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) {
        window.jQuery(existing).modal('hide');
      }
      existing.remove();
    }

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal fade';
    modal.tabIndex = '-1';
    modal.role = 'dialog';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    return modal;
  }

  function openPixModal(rawData = {}, options = {}) {
    const data = normalizePixPaymentData(rawData);
    const settings = Object.assign({
      modalId: DEFAULT_MODAL_ID,
      autoShow: true,
      closeOnConfirm: false,
      onCopy: noop,
      onConfirm: noop,
      onClose: noop
    }, options);

    const modal = mountModal(buildModalMarkup(data), settings.modalId);
    const $ = window.jQuery;
    if ($ && $.fn && $.fn.modal && settings.autoShow) {
      $(modal).modal('show');
    } else {
      modal.classList.add('show');
      modal.style.display = 'block';
    }

    attachEvents(settings.modalId, data, settings);
    return { modalId: settings.modalId, data };
  }

  function closePixModal(modalId = DEFAULT_MODAL_ID) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const $ = window.jQuery;
    if ($ && $.fn && $.fn.modal) {
      $(modal).modal('hide');
    } else {
      modal.remove();
    }
  }

  window.PixPaymentModal = {
    normalize: normalizePixPaymentData,
    open: openPixModal,
    close: closePixModal
  };

})(window, document);
