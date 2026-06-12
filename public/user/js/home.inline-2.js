// Extraído de public/user/home.html (bloco inline #2) para permitir CSP sem unsafe-inline.
// Funções utilitárias do modal PIX
      // Passa um valor com segurança para handlers inline (contexto JS dentro
      // de atributo HTML): JSON.stringify cria a string JS; escapeHtml protege o atributo.
      function jsArg(value) {
        return escapeHtml(JSON.stringify(String(value ?? '')));
      }
      function escapeHtml(value = '') {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function formatMoneyValue(value) {
        const numeric = Number(value);
        return Number.isNaN(numeric) ? '0.00' : numeric.toFixed(2);
      }

      function normalizePixModalData(raw = {}) {
        const data = raw || {};
        const base64Image = data.qr_code_base64 || data.qrCodeBase64 || data.qr_code_image || data.qrCodeImage;
        let qrImage = null;

        if (base64Image) {
          const trimmed = String(base64Image).trim();
          qrImage = trimmed.startsWith('data:image') ? trimmed : `data:image/png;base64,${trimmed}`;
        } else if (data.qr_code && /^data:image|^https?:\/\//i.test(String(data.qr_code))) {
          qrImage = data.qr_code;
        }

        const pixCopyValue = data.qr_code_text
          || data.qrCodeText
          || data.qr_code_payload
          || data.pix_qr_code_text
          || data.pix_qr_code
          || data.codigo_pix
          || data.codigoPix
          || data.chave_pix
          || data.chavePix
          || '';

        const localPaymentId = data.pagamento_id
          ?? data.payment_local_id
          ?? (Number.isFinite(data.id) ? data.id : null);

        const gatewayPaymentId = data.gateway_payment_id
          ?? data.gatewayPaymentId
          ?? data.payment_id
          ?? null;

        return {
          qr_code: qrImage,
          qr_code_image: qrImage,
          qr_code_text: pixCopyValue,
          reserva_id: data.reserva_id || data.reservaId || null,
          payment_id: localPaymentId ?? gatewayPaymentId ?? null,
          pagamento_id: localPaymentId ?? null,
          gateway_payment_id: gatewayPaymentId ?? null,
          split: data.split || data.splitInfo || null,
          valor: data.valor ?? data.valor_total ?? null,
          expira_em: data.expira_em || data.data_expiracao || data.expiration || null,
          chave_pix: data.chave_pix || data.chavePix || null,
          nome_titular: data.nome_titular || data.titular || null,
          raw
        };
      }

      function preparePixModalData(reservaId, raw = {}) {
        return normalizePixModalData({
          ...raw,
          reserva_id: raw.reserva_id || raw.reservaId || reservaId || null
        });
      }

      // Função para exibir o modal de pagamento PIX
      function showPixPaymentModal(pixData) {
        const modalPixData = normalizePixModalData(pixData);
        const qrImageSrc = modalPixData.qr_code
          || (modalPixData.qr_code_text
            ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(modalPixData.qr_code_text)}`
            : '');
        const pixCopyValue = modalPixData.qr_code_text || '';
        const pixInputValue = escapeHtml(pixCopyValue);
        const copyButtonDisabledAttr = pixCopyValue ? '' : 'disabled aria-disabled="true"';
        const qrCodeMarkup = qrImageSrc
          ? `<img src="${qrImageSrc}"
               alt="QR Code PIX"
               class="img-fluid"
               style="max-width: min(250px, 80vw); height: auto; border: 2px solid #004080; border-radius: 8px; padding: 10px; background: white;">`
          : `<div class="text-muted small">QR Code indisponível. Utilize o código PIX abaixo.</div>`;

        const modalContent = `
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

                  <div class="mb-3">
                    <label class="form-label small text-muted">Ou copie o código PIX:</label>
                    <div class="input-group">
                      <input type="text"
                           id="pixCode"
                           class="form-control form-control-sm"
                           value="${pixInputValue}"
                           placeholder="${pixCopyValue ? '' : 'Código PIX indisponível'}"
                           readonly
                           style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis;">
                      <button class="btn btn-outline-primary btn-sm"
                          type="button"
                          id="copyPixCode"
                          data-reserva-id="${modalPixData.reserva_id}"
                          ${copyButtonDisabledAttr}>
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

                  <hr class="my-3">
                  <div class="text-start">
                    <p class="small text-muted mb-2">
                      <i class="fas fa-info-circle me-1"></i>
                      Depois de pagar pelo seu banco, <strong>anexe o comprovante</strong> abaixo.
                      O estacionamento confirmará seu pagamento e sua vaga ficará reservada.
                    </p>
                    <input type="file"
                           id="comprovantePixFile"
                           accept="image/jpeg,image/png,image/webp,application/pdf"
                           class="form-control form-control-sm">
                    <div id="comprovanteFeedback" class="mt-2" style="display: none;"></div>
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

        const modalId = 'pixPaymentModal';
        let modal = document.getElementById(modalId);

        if (modal) {
          modal.remove();
        }

        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = '-1';
        modal.role = 'dialog';
        modal.innerHTML = modalContent;

        document.body.appendChild(modal);

        $(`#${modalId}`).modal('show');

        $(`#${modalId} #copyPixCode`).on('click', async function() {
          if (!pixCopyValue) {
            return;
          }

          const pixCode = document.getElementById('pixCode');
          const reservaId = $(this).data('reserva-id');

          if (pixCode) {
            pixCode.select();
            document.execCommand('copy');
          } else if (navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(pixCopyValue);
            } catch (err) {
              console.error('Erro ao copiar código PIX:', err);
            }
          }

          const originalText = $(this).html();
          $(this).html('<i class="fas fa-check"></i> Copiado!');
          $('#pixCopyFeedback').fadeIn();

          try {
            await fetchWithAuth(`/api/reservas/${reservaId}/notificar-pagamento`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                tipo: 'pix_copiado',
                codigoPix: modalPixData.qr_code_text,
                timestamp: new Date().toISOString()
              })
            });
            console.log('Notificação de pagamento enviada com sucesso');
          } catch (error) {
            console.error('Erro ao enviar notificação de pagamento:', error);
          }

          setTimeout(() => {
            $(this).html(originalText);
          }, 2000);
        });

        $(`#${modalId} #enviarComprovanteBtn`).on('click', async function() {
          const fileInput = document.getElementById('comprovantePixFile');
          const feedback = $('#comprovanteFeedback');
          const reservaIdEnvio = modalPixData.reserva_id;

          if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            feedback.removeClass('alert-success').addClass('alert alert-danger')
              .html('<i class="fas fa-exclamation-triangle me-1"></i>Selecione um arquivo (JPG/PNG/WEBP/PDF).')
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
          const originalLabel = btn.html();
          btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm" role="status"></span> Enviando...');

          try {
            const formData = new FormData();
            formData.append('comprovante', file);

            const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
            const resp = await fetch(`/api/reservas/${reservaIdEnvio}/comprovante`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              credentials: 'include',
              body: formData,
            });

            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.message || 'Falha ao enviar comprovante.');
            }

            feedback.removeClass('alert-danger').addClass('alert alert-success')
              .html('<i class="fas fa-check-circle me-1"></i>Comprovante enviado. Aguardando confirmação do estacionamento.')
              .show();

            setTimeout(() => {
              $(`#${modalId}`).modal('hide');
              showUserAlert('Comprovante enviado! O estacionamento confirmará em breve. Acompanhe em "Minhas Reservas".', 'success');
              if (typeof loadMinhasReservas === 'function' &&
                  document.getElementById('reservasSection')?.style.display === 'block') {
                loadMinhasReservas();
              }
            }, 1800);
          } catch (err) {
            console.error('[Comprovante] Erro:', err);
            feedback.removeClass('alert-success').addClass('alert alert-danger')
              .html(`<i class="fas fa-exclamation-triangle me-1"></i>${escapeHtml(err.message)}`)
              .show();
            btn.prop('disabled', false).html(originalLabel);
          }
        });

        let checkPaymentStatus = null;

        if (modalPixData.payment_id) {
          checkPaymentStatus = setInterval(async () => {
            try {
              const response = await fetchWithAuth(`/api/pagamentos/${modalPixData.payment_id}/status`);
              if (response.status === 'approved') {
                clearInterval(checkPaymentStatus);
                showUserAlert('Pagamento aprovado! Sua reserva foi confirmada.', 'success');
                $(`#${modalId}`).modal('hide');
                if (document.getElementById('reservasSection').style.display === 'block') {
                  loadMinhasReservas();
                }
              } else if (response.status === 'cancelled' || response.status === 'rejected') {
                clearInterval(checkPaymentStatus);
                showUserAlert(`Pagamento ${response.status}. Por favor, tente novamente.`, 'danger');
              }
            } catch (error) {
              console.error('Erro ao verificar status do pagamento:', error);
            }
          }, 10000);
        }

        $(`#${modalId}`).on('hidden.bs.modal', function () {
          if (checkPaymentStatus) {
            clearInterval(checkPaymentStatus);
          }
          $(this).remove();
        });
      }
