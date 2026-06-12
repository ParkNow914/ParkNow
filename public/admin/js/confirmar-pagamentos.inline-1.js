// Extraído de public/admin/confirmar-pagamentos.html (bloco inline #1) para permitir CSP sem unsafe-inline.
const API = '/api';
    let refreshInterval = null;
    let reservaIdRejeicao = null;

    function getToken() {
      return localStorage.getItem('adminAccessToken')
          || localStorage.getItem('accessToken')
          || sessionStorage.getItem('accessToken')
          || '';
    }

    async function api(path, opts = {}) {
      const resp = await fetch(API + path, {
        ...opts,
        credentials: 'include',
        headers: {
          'Authorization': 'Bearer ' + getToken(),
          'Content-Type': 'application/json',
          ...(opts.headers || {})
        }
      });
      if (resp.status === 401) {
        flash('Sessão expirada. Faça login novamente.', 'danger');
        setTimeout(() => window.location.href = '/admin_home/admin-home.html', 1500);
        throw new Error('unauthorized');
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || 'Erro na requisição');
      return data;
    }

    function flash(msg, kind = 'success') {
      const $t = $('#flashToast');
      $t.attr('class', 'alert alert-' + kind).text(msg).fadeIn();
      setTimeout(() => $t.fadeOut(), 4000);
    }

    function fmtDataHora(iso) {
      if (!iso) return '—';
      try { return new Date(iso).toLocaleString('pt-BR'); }
      catch (_e) { return iso; }
    }

    function renderLista(pagamentos) {
      const $c = $('#listaPagamentos');
      if (!pagamentos || pagamentos.length === 0) {
        $c.html(`
          <div class="empty-state">
            <i class="fas fa-check-circle text-success"></i>
            <p>Nenhum pagamento aguardando confirmação.</p>
          </div>
        `);
        return;
      }
      const html = pagamentos.map(p => {
        // O comprovante é PII financeira e não é servido estaticamente: é
        // baixado via endpoint autenticado e exibido como blob.
        const compUrl = p.comprovante_url || '';
        const isPdf = compUrl.toLowerCase().endsWith('.pdf');
        const pagamentoId = Number(p.pagamento_id);
        const preview = isPdf
          ? `<button type="button" class="btn btn-sm btn-outline-primary" onclick="abrirComprovantePdf(${pagamentoId})">
                <i class="fas fa-file-pdf me-1"></i>Abrir PDF
             </button>`
          : `<img class="comprovante-img comprovante-blob" alt="comprovante"
                 data-pagamento-id="${pagamentoId}"
                 onclick="abrirComprovante(${pagamentoId})">`;
        return `
          <div class="card-pagamento">
            <div class="row g-0">
              <div class="col-md-3 border-end p-3">
                <div class="label">Reserva</div>
                <div class="value">#${p.reserva_id}</div>
                <div class="mt-2 label">Estacionamento</div>
                <div class="value">${escapeHtml(p.estacionamento_nome || '')}</div>
                <div class="mt-2 label">Cliente</div>
                <div class="value">${escapeHtml(p.cliente_nome || '')}</div>
                <div class="small text-muted">${escapeHtml(p.cliente_email || '')}</div>
              </div>
              <div class="col-md-4 border-end p-3">
                <div class="label">Valor</div>
                <div class="value text-success">R$ ${Number(p.valor).toFixed(2)}</div>
                <div class="mt-2 label">Placa</div>
                <div class="value">${escapeHtml(p.placa_veiculo || '—')}</div>
                <div class="mt-2 label">Entrada / Saída</div>
                <div class="small">${fmtDataHora(p.data_entrada_prevista)} →<br>
                                    ${fmtDataHora(p.data_saida_prevista)}</div>
                <div class="mt-2 label">Comprovante enviado em</div>
                <div class="small">${fmtDataHora(p.comprovante_enviado_em)}</div>
              </div>
              <div class="col-md-3 border-end p-3 text-center">
                <div class="label mb-2">Comprovante</div>
                ${preview}
              </div>
              <div class="col-md-2 p-3 d-flex flex-column justify-content-center actions">
                <button class="btn btn-success btn-sm mb-2" onclick="confirmar(${p.reserva_id})">
                  <i class="fas fa-check me-1"></i>Confirmar
                </button>
                <button class="btn btn-outline-danger btn-sm" onclick="abrirRejeicao(${p.reserva_id})">
                  <i class="fas fa-times me-1"></i>Rejeitar
                </button>
              </div>
            </div>
          </div>`;
      }).join('');
      $c.html(html);

      // Carrega as miniaturas dos comprovantes via endpoint autenticado
      $c.find('img.comprovante-blob').each(function () {
        const $img = $(this);
        const id = $img.data('pagamento-id');
        fetchComprovanteBlob(id)
          .then(url => { if (url) $img.attr('src', url); })
          .catch(() => { /* mantém placeholder sem src */ });
      });
    }

    function escapeHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      }[c]));
    }

    async function carregar() {
      try {
        const data = await api('/admin/pagamentos/aguardando-confirmacao');
        renderLista(data.data || []);
      } catch (err) {
        if (err.message !== 'unauthorized') {
          $('#listaPagamentos').html(`
            <div class="empty-state text-danger">
              <i class="fas fa-exclamation-triangle"></i>
              <p>${escapeHtml(err.message)}</p>
            </div>`);
        }
      }
    }

    window.confirmar = async function(reservaId) {
      if (!confirm('Confirmar este pagamento? A reserva ficará ativa e a vaga ocupada.')) return;
      try {
        await api(`/admin/reservas/${reservaId}/confirmar-pagamento`, { method: 'POST' });
        flash('Pagamento confirmado com sucesso.', 'success');
        carregar();
      } catch (err) {
        flash('Erro: ' + err.message, 'danger');
      }
    };

    window.abrirRejeicao = function(reservaId) {
      reservaIdRejeicao = reservaId;
      $('#motivoRejeicao').val('');
      $('#motivoCount').text('0');
      $('#rejeitarModal').modal('show');
    };

    $('#motivoRejeicao').on('input', function() {
      $('#motivoCount').text(this.value.length);
    });

    $('#confirmarRejeicaoBtn').on('click', async function() {
      const motivo = ($('#motivoRejeicao').val() || '').trim();
      if (motivo.length < 3) {
        alert('Informe um motivo (mínimo 3 caracteres).');
        return;
      }
      try {
        await api(`/admin/reservas/${reservaIdRejeicao}/rejeitar-pagamento`, {
          method: 'POST',
          body: JSON.stringify({ motivo })
        });
        $('#rejeitarModal').modal('hide');
        flash('Pagamento rejeitado.', 'warning');
        carregar();
      } catch (err) {
        flash('Erro: ' + err.message, 'danger');
      }
    });

    // Busca o comprovante pelo endpoint autenticado e devolve um blob URL.
    const comprovanteBlobCache = new Map();
    async function fetchComprovanteBlob(pagamentoId) {
      if (comprovanteBlobCache.has(pagamentoId)) return comprovanteBlobCache.get(pagamentoId);
      const resp = await fetch(`${API}/admin/pagamentos/${pagamentoId}/comprovante`, {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (!resp.ok) throw new Error('Falha ao carregar comprovante');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      comprovanteBlobCache.set(pagamentoId, url);
      return url;
    }

    window.abrirComprovante = async function(pagamentoId) {
      try {
        const url = await fetchComprovanteBlob(pagamentoId);
        const img = document.createElement('img');
        img.src = url;
        img.className = 'img-fluid';
        $('#viewComprovanteBody').empty().append(img);
        $('#viewComprovanteModal').modal('show');
      } catch (err) {
        flash('Erro ao abrir comprovante: ' + err.message, 'danger');
      }
    };

    window.abrirComprovantePdf = async function(pagamentoId) {
      try {
        const url = await fetchComprovanteBlob(pagamentoId);
        window.open(url, '_blank');
      } catch (err) {
        flash('Erro ao abrir comprovante: ' + err.message, 'danger');
      }
    };

    // Inicialização
    carregar();
    refreshInterval = setInterval(carregar, 30000);

    // Limpeza ao sair
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) clearInterval(refreshInterval);
    });
