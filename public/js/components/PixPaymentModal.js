// public/js/components/PixPaymentModal.js
//
// Modal de pagamento PIX (always free). Mostra QR Code + copia-e-cola e um
// botão para o usuário anexar o comprovante após pagar pelo banco.
// Sem checkout externo, sem split — fluxo manual com confirmação por admin.

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
      || '';

    const localPaymentId = raw.pagamento_id
      ?? raw.payment_local_id
      ?? (Number.isFinite(raw.id) ? raw.id : null);

    return {
      qr_code: qrImage,
      qr_code_text: pixCopyValue,
      reserva_id: raw.reserva_id || raw.reservaId || null,
      pagamento_id: localPaymentId ?? null,
      valor: raw.valor ?? raw.valor_total ?? null,
      expira_em: raw.expira_em || raw.data_expiracao || null,
      chave_pix: raw.chave_pix || raw.chavePix || null,
      nome_titular: raw.nome_titular || raw.titular || null,
    };
  }

  function buildHeaderInfo(data) {
    const parts = [];
    if (data.valor) parts.push(`<strong>Valor:</strong> R$ ${Number(data.valor).toFixed(2)}`);
    if (data.chave_pix) parts.push(`<strong>Chave:</strong> ${escapeHtml(data.chave_pix)}`);
    if (data.nome_titular) parts.push(`<strong>Recebedor:</strong> ${escapeHtml(data.nome_titular)}`);
    if (!parts.length) return '';
    return `<div class="card border-light bg-light mb-3 text-start p-2" style="font-size:0.85rem;">
        ${parts.map(p => `<div>${p}</div>`).join('')}
    </div>`;
  }

  function buildModalMarkup(data) {
    const qrImageSrc = data.qr_code
      || (data.qr_code_text
        ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data.qr_code_text)}`
        : '');

    const qrCodeMarkup = qrImageSrc
      ? `<img src="${qrImageSrc}" alt="QR Code PIX" class="img-fluid"
               style="max-width: min(250px, 80vw); border: 2px solid #004080; border-radius: 8px; padding: 10px; background: white;">`
      : `<div class="text-muted small">QR Code indisponível. Copie o código PIX abaixo.</div>`;

    const pixInputValue = escapeHtml(data.qr_code_text || '');
    const copyDisabledAttr = data.qr_code_text ? '' : 'disabled aria-disabled="true"';

    return `
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style="max-width: 500px;">
        <div class="modal-content" style="max-height: 90vh;">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title"><i class="fas fa-qrcode me-2"></i>Pagamento via PIX</h5>
            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Fechar">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body" style="overflow-y: auto; max-height: calc(90vh - 140px);">
            <div class="text-center">
              <p class="lead mb-3">Escaneie o QR Code para pagar</p>
              <div class="qr-code-container mb-3">${qrCodeMarkup}</div>
              ${buildHeaderInfo(data)}
              <div class="mb-3 text-start">
                <label class="form-label small text-muted">Ou copie o código PIX:</label>
                <div class="input-group">
                  <input type="text" id="pixCode" class="form-control form-control-sm"
                         value="${pixInputValue}"
                         placeholder="${data.qr_code_text ? '' : 'Código PIX indisponível'}"
                         readonly style="font-size: 0.75rem;">
                  <button class="btn btn-outline-primary btn-sm" type="button" id="copyPixCode" ${copyDisabledAttr}>
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
              <div id="pixCopyFeedback" class="alert alert-success py-2" style="display:none; font-size:0.9rem;">
                <i class="fas fa-check-circle me-1"></i> Código copiado!
              </div>

              <hr class="my-3">
              <div class="text-start">
                <p class="small text-muted mb-2">
                  <i class="fas fa-info-circle me-1"></i>
                  Pagou pelo seu banco? Anexe o comprovante (foto ou PDF). O estacionamento confirma manualmente.
                </p>
                <input type="file" id="comprovantePixFile"
                       accept="image/jpeg,image/png,image/webp,application/pdf"
                       class="form-control form-control-sm">
                <div id="comprovanteFeedback" class="mt-2" style="display:none;"></div>
              </div>
            </div>
          </div>
          <div class="modal-footer d-flex justify-content-between flex-wrap">
            <button type="button" class="btn btn-secondary btn-sm mb-1" data-dismiss="modal">
              <i class="fas fa-times me-1"></i>Fechar
            </button>
            <button type="button" class="btn btn-success btn-sm mb-1" id="enviarComprovanteBtn">
              <i class="fas fa-upload me-1"></i>Enviar comprovante
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
      console.warn('[PixPaymentModal] jQuery/Bootstrap não encontrados.');
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
        try { await navigator.clipboard.writeText(data.qr_code_text); }
        catch (err) { console.error('Erro ao copiar PIX:', err); }
      }
      const originalHtml = $(this).html();
      $(this).html('<i class="fas fa-check"></i> Copiado!');
      $('#pixCopyFeedback').fadeIn();
      try { options.onCopy(data); }
      finally { setTimeout(() => $(this).html(originalHtml), 2000); }
    });

    $(`${selector} #enviarComprovanteBtn`).on('click', async function() {
      const fileInput = document.getElementById('comprovantePixFile');
      const feedback = $('#comprovanteFeedback');
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        feedback.removeClass('alert-success').addClass('alert alert-danger')
          .html('<i class="fas fa-exclamation-triangle me-1"></i>Selecione um arquivo.')
          .show();
        return;
      }
      const file = fileInput.files[0];
      if (file.size > 5 * 1024 * 1024) {
        feedback.removeClass('alert-success').addClass('alert alert-danger')
          .html('<i class="fas fa-exclamation-triangle me-1"></i>Arquivo muito grande (máx 5MB).')
          .show();
        return;
      }
      const btn = $(this);
      const original = btn.html();
      btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span> Enviando...');
      try {
        const fd = new FormData();
        fd.append('comprovante', file);
        const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
        const resp = await fetch(`/api/reservas/${data.reserva_id}/comprovante`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include',
          body: fd,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.message || 'Falha ao enviar comprovante.');
        }
        feedback.removeClass('alert-danger').addClass('alert alert-success')
          .html('<i class="fas fa-check-circle me-1"></i>Comprovante enviado. Aguardando confirmação.')
          .show();
        setTimeout(() => {
          options.onConfirm(data);
          if (options.closeOnConfirm !== false) $(selector).modal('hide');
        }, 1500);
      } catch (err) {
        feedback.removeClass('alert-success').addClass('alert alert-danger')
          .html(`<i class="fas fa-exclamation-triangle me-1"></i>${escapeHtml(err.message)}`)
          .show();
        btn.prop('disabled', false).html(original);
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
      if (window.jQuery?.fn?.modal) window.jQuery(existing).modal('hide');
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
      closeOnConfirm: true,
      onCopy: noop,
      onConfirm: noop,
      onClose: noop,
    }, options);

    const modal = mountModal(buildModalMarkup(data), settings.modalId);
    const $ = window.jQuery;
    if ($?.fn?.modal && settings.autoShow) {
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
    if ($?.fn?.modal) $(modal).modal('hide');
    else modal.remove();
  }

  window.PixPaymentModal = {
    normalize: normalizePixPaymentData,
    open: openPixModal,
    close: closePixModal,
  };

})(window, document);
