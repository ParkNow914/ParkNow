// Extraído de public/user/home.html (bloco inline #4) para permitir CSP sem unsafe-inline.
// ***** SCRIPT FINAL (HOME COM SOCKET.IO E RESERVAS) *****
    let map, userMarker = null, estMarkers = L.layerGroup(), geoCtrl, selEstId = null, userData = null;
    let homeSocket = null; let subscribedRooms = new Set();
    // Assume config global para socket, pode ser buscado da API se necessário
    let config = { realtime: { enabled: true } };

    // --- Feedback ---
    const showUserAlert = (msg, type='info', duration=4000) => { const el=document.getElementById('mainAlertBox'); if(el){ const id=`alert-${Date.now()}`; el.insertAdjacentHTML('beforeend', `<div id="${id}" class="alert alert-${type} alert-dismissible fade show m-2" role="alert" style="font-size:0.9rem; padding:.5rem 1rem;">${escapeHtml(msg)}<button type="button" class="close" data-dismiss="alert" style="padding:.5rem 1rem; color: #000000; opacity: 0.8; font-weight: 700; text-shadow: 0 1px 0 #fff;">×</button></div>`); setTimeout(() => { $(`#${id}`).alert('close'); }, duration); } else { alert(msg); } };
    const showLoadingModal = (modalId, isLoading, btnSelector = 'button.btn-primary') => { const btn = document.querySelector(`#${modalId} ${btnSelector}`); if(btn){ btn.disabled = isLoading; const s=btn.querySelector('.spinner-border'); if(s) s.style.display = isLoading ? 'inline-block' : 'none'; }};
    const showAlertModal = (elId, msg, type='danger') => {const fb=document.getElementById(elId); if(fb){fb.innerHTML=`<div class="alert alert-${type} alert-sm py-1 px-2 m-0">${escapeHtml(msg)}</div>`; fb.style.display='block';}};
    const hideAlertModal = (elId) => {const fb=document.getElementById(elId); if(fb)fb.style.display='none';};
    const setErrorFor = (input, message) => { input.classList.add('is-invalid'); const fb = input.closest('.form-group')?.querySelector('.invalid-feedback'); if(fb) {fb.textContent=message; fb.style.display='block';} return false; };
    const clearErrorFor = (input) => { input.classList.remove('is-invalid'); const fb = input.closest('.form-group')?.querySelector('.invalid-feedback'); if(fb) fb.style.display='none'; return true;};

    // --- Perfil do Usuário ---
    async function loadUserProfile() {
      try {
        const userData = await fetchWithAuth('/api/user/profile');
        if (userData) {
          // Depurar o formato dos dados do usuário
          console.log('Dados do usuário recebidos do servidor:', JSON.stringify(userData, null, 2));

          // Preencher os campos do formulário
          document.getElementById('userName').value = userData.nome || '';
          document.getElementById('userEmail').value = userData.email || '';
          document.getElementById('userPhone').value = userData.telefone || '';
          document.getElementById('userCpf').value = userData.cpf || '';
          document.getElementById('userPlaca').value = userData.placa_veiculo || '';

          // Atualizar o select de tipo de veículo
          const tipoVeiculoSelect = document.getElementById('userTipoVeiculo');
          if (tipoVeiculoSelect) {
            // Encontrar a opção correspondente e selecioná-la
            for (let i = 0; i < tipoVeiculoSelect.options.length; i++) {
              if (tipoVeiculoSelect.options[i].value === userData.tipo_veiculo) {
                tipoVeiculoSelect.selectedIndex = i;
                break;
              }
            }
          }

          // Atualizar o cabeçalho do perfil
          document.getElementById('userNameDisplay').textContent = userData.nome || 'Usuário';
          document.getElementById('userEmailDisplay').textContent = userData.email || '';

          return userData;
        }
      } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        showAlertModal('user-profile-feedback', 'Não foi possível carregar seu perfil. Tente novamente mais tarde.');
      }
      return null;
    }

    function toggleUserFormEdit(editable) {
      const form = document.getElementById('userForm');
      const inputs = form.querySelectorAll('input, select');

      // Atualizar estado dos campos
      inputs.forEach(input => {
        input.readOnly = !editable;

        // Tratamento especial para o select
        if (input.tagName === 'SELECT') {
          input.disabled = !editable;
        }
      });

      // Atualizar visibilidade dos botões
      document.getElementById('editUserBtn').style.display = editable ? 'none' : 'inline-block';
      document.getElementById('saveUserBtn').style.display = editable ? 'inline-block' : 'none';
      document.getElementById('cancelEditBtn').style.display = editable ? 'inline-block' : 'none';
      document.getElementById('closeUserBtn').style.display = editable ? 'none' : 'inline-block';
    }

    function validateUserForm() {
      const form = document.getElementById('userForm');
      let isValid = true;

      // Validar nome
      const nameInput = document.getElementById('userName');
      if (!nameInput.value.trim()) {
        isValid = setErrorFor(nameInput, 'Nome é obrigatório');
      } else {
        clearErrorFor(nameInput);
      }

      // Validar email
      const emailInput = document.getElementById('userEmail');
      if (!emailInput.value.trim()) {
        isValid = setErrorFor(emailInput, 'Email é obrigatório');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
        isValid = setErrorFor(emailInput, 'Email inválido');
      } else {
        clearErrorFor(emailInput);
      }

      // Validar telefone - deve ter 10 ou 11 dígitos apenas
      const phoneInput = document.getElementById('userPhone');
      const phoneDigits = phoneInput.value.replace(/\D/g, ''); // Remove não-dígitos
      if (!phoneInput.value.trim()) {
        isValid = setErrorFor(phoneInput, 'Telefone é obrigatório');
      } else if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        isValid = setErrorFor(phoneInput, 'Telefone deve ter 10 ou 11 dígitos');
      } else {
        clearErrorFor(phoneInput);
        // Atualizar o valor do campo para conter apenas dígitos
        phoneInput.value = phoneDigits;
      }

      // Validar tipo de veículo
      const tipoVeiculoSelect = document.getElementById('userTipoVeiculo');
      if (!tipoVeiculoSelect.value) {
        isValid = setErrorFor(tipoVeiculoSelect, 'Tipo de veículo é obrigatório');
      } else {
        clearErrorFor(tipoVeiculoSelect);
      }

      // Validar placa - formato Mercosul (AAA0A00) ou antigo (AAA0000)
      const placaInput = document.getElementById('userPlaca');
      const placaValue = placaInput.value.trim().toUpperCase();
      if (!placaValue) {
        isValid = setErrorFor(placaInput, 'Placa é obrigatória');
      } else if (!/^([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/.test(placaValue)) {
        isValid = setErrorFor(placaInput, 'Formato de placa inválido (AAA0000 ou AAA0A00)');
      } else {
        clearErrorFor(placaInput);
        // Atualizar o valor do campo para o formato correto em maiúsculas
        placaInput.value = placaValue;
      }

      // Validar CPF (opcional) - formato 000.000.000-00
      const cpfInput = document.getElementById('userCpf');
      const cpfValue = cpfInput.value.trim();
      if (cpfValue && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpfValue)) {
        isValid = setErrorFor(cpfInput, 'CPF deve estar no formato 000.000.000-00');
      } else {
        clearErrorFor(cpfInput);
      }

      return isValid;
    }

    async function saveUserProfile() {
      if (!validateUserForm()) return;

      showLoadingModal('userModal', true, '#saveUserBtn');
      hideAlertModal('user-profile-feedback');

      try {
        // Obter os valores dos campos
        const nome = document.getElementById('userName').value.trim();
        const email = document.getElementById('userEmail').value.trim();
        const telefoneRaw = document.getElementById('userPhone').value.trim();
        const telefone = telefoneRaw.replace(/\D/g, ''); // Remover não-dígitos
        const tipo_veiculo = document.getElementById('userTipoVeiculo').value;
        const placa_veiculo = document.getElementById('userPlaca').value.trim().toUpperCase();
        const cpf = document.getElementById('userCpf').value.trim() || null;

        // Verificar se o nome é obrigatório
        if (!nome) {
          throw new Error('Nome é obrigatório');
        }

        // Verificar se o email é válido
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          throw new Error('Email inválido');
        }

        // Verificar se o telefone tem o formato correto (10 ou 11 dígitos)
        if (telefone.length < 10 || telefone.length > 11) {
          throw new Error('Telefone deve ter 10 ou 11 dígitos');
        }

        // Verificar se o tipo de veículo está selecionado
        if (!tipo_veiculo) {
          throw new Error('Tipo de veículo é obrigatório');
        }

        // Verificar se a placa tem o formato correto (AAA0000 ou AAA0A00)
        const placaRegex = /^([A-Z]{3}\d{4}|[A-Z]{3}\d[A-Z]\d{2})$/;
        if (!placaRegex.test(placa_veiculo)) {
          throw new Error('Placa inválida (formato Mercosul ou antigo)');
        }

        // Verificar o CPF se fornecido
        if (cpf && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf)) {
          throw new Error('CPF inválido (formato 000.000.000-00)');
        }

        // Criar o objeto de dados exatamente como o backend espera
        // IMPORTANTE: O controller agora espera nome, email, telefone, tipo_veiculo, placa_veiculo e cpf
        const formData = {
          nome,
          email,
          telefone,
          tipo_veiculo,
          placa_veiculo,
          cpf
        };

        console.log('Enviando dados:', JSON.stringify(formData, null, 2));

        // Fazer uma requisição direta
        const response = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify(formData)
        });

        // Capturar a resposta completa
        const responseText = await response.text();
        console.log('Resposta completa do servidor:', responseText);

        // Tentar analisar a resposta como JSON
        let responseData;
        try {
          responseData = JSON.parse(responseText);
          console.log('Resposta JSON analisada:', responseData);
        } catch (e) {
          console.error('Erro ao analisar resposta JSON:', e);
          responseData = { message: 'Erro ao processar resposta do servidor' };
        }

        if (!response.ok) {
          console.error('Erro HTTP:', response.status, response.statusText);
          console.error('Detalhes do erro:', responseData);

          if (response.status === 422 && responseData.errors) {
            // Exibir detalhes completos dos erros no console
            console.error('Erros de validação detalhados:', JSON.stringify(responseData.errors, null, 2));

            // Formatar mensagens de erro para exibição
            const errorMessages = responseData.errors.map(err =>
              `Campo '${err.param}': ${err.msg} (Valor recebido: '${err.value}')`
            ).join('\n');

            throw new Error(`Erros de validação:\n${errorMessages}`);
          } else {
            throw new Error(responseData.message || 'Erro ao atualizar perfil');
          }
        }

        // Atualizar a interface em caso de sucesso
        document.getElementById('userNameDisplay').textContent = nome;
        document.getElementById('userEmailDisplay').textContent = email;

        showAlertModal('user-profile-feedback', 'Perfil atualizado com sucesso!', 'success');
        toggleUserFormEdit(false);

      } catch (error) {
        console.error('Erro ao salvar perfil:', error);
        showAlertModal('user-profile-feedback', error.message || 'Erro ao atualizar perfil. Tente novamente.');
      } finally {
        showLoadingModal('userModal', false, '#saveUserBtn');
      }
    }


    // --- Socket.IO para notificações em tempo real ---
    let socket = null;
    let notificacoesAtivas = [];

    function connectSocketIO() {
        // Desconectar se já existir
        disconnectSocketIO();

        // Conectar com autenticação
        socket = io(window.location.origin, {
            auth: { token: getAuthToken() },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000
        });

        socket.on('connect', () => {
            console.log('Socket.IO conectado!');
            // Entrar na sala do usuário
            if (infoUsuario?.id) {
                socket.emit('join_usuario_room', infoUsuario.id);
            }
        });

        socket.on('connect_error', (err) => {
            console.error('Erro de conexão Socket.IO:', err.message);
            // Tentar reconectar manualmente após 5 segundos
            setTimeout(() => {
                if (socket && !socket.connected) {
                    console.log('Tentando reconectar manualmente...');
                    socket.connect();
                }
            }, 5000);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket.IO desconectado:', reason);
            // Se a desconexão não foi intencional, tentar reconectar
            if (reason === 'io server disconnect' || reason === 'transport close') {
                setTimeout(() => {
                    console.log('Tentando reconectar após desconexão...');
                    if (socket) socket.connect();
                }, 3000);
            }
        });

        // Eventos específicos da aplicação
        socket.on('notificacao_usuario', (data) => {
            console.log('Notificação recebida:', data);

            // Exibir notificação na interface
            if (data.tipo === 'vaga_ocupada') {
                exibirNotificacao('Vaga Ocupada', `Você ocupou a vaga ${data.numeroVaga} no estacionamento ${data.estacionamentoNome || data.estacionamentoId}`);
            }
            else if (data.tipo === 'vaga_liberada') {
                const tempoFormatado = formatarTempoSegundos(data.tempoEstacionado);
                exibirNotificacao('Vaga Liberada', `Você liberou a vaga ${data.numeroVaga}. Tempo estacionado: ${tempoFormatado}`);
            }
            else if (data.tipo === 'reserva_criada') {
                exibirNotificacao('Reserva Criada', `Sua reserva para a vaga ${data.numeroVaga} foi criada com sucesso!`);
            }
            else if (data.tipo === 'reserva_expirada') {
                exibirNotificacao('Reserva Expirada', `Sua reserva para a vaga ${data.numeroVaga} expirou.`);
            }
        });
    }

    function disconnectSocketIO() {
        if (socket) {
            // Sair da sala do usuário
            if (infoUsuario?.id) {
                socket.emit('leave_usuario_room', infoUsuario.id);
            }
            socket.disconnect();
            socket = null;
        }
    }

    // Função para exibir notificações na interface
    function exibirNotificacao(titulo, mensagem) {
        // Criar ID único para a notificação
        const notificacaoId = `notif-${Date.now()}`;

        // Criar elemento de notificação
        const notificacaoHTML = `
            <div id="${notificacaoId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-delay="5000">
                <div class="toast-header">
                    <strong class="mr-auto">${escapeHtml(titulo)}</strong>
                    <small>Agora</small>
                    <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="toast-body">
                    ${escapeHtml(mensagem)}
                </div>
            </div>
        `;

        // Adicionar à área de notificações
        const notificacoesArea = document.getElementById('notificacoesArea');
        if (!notificacoesArea) {
            // Criar área de notificações se não existir
            const areaHTML = `<div id="notificacoesArea" style="position: fixed; top: 20px; right: 20px; z-index: 9999;"></div>`;
            document.body.insertAdjacentHTML('beforeend', areaHTML);
        }

        // Adicionar notificação à área
        document.getElementById('notificacoesArea').insertAdjacentHTML('beforeend', notificacaoHTML);

        // Mostrar notificação
        $(`#${notificacaoId}`).toast('show');

        // Adicionar à lista de notificações ativas
        notificacoesAtivas.push(notificacaoId);

        // Remover da lista quando fechada
        $(`#${notificacaoId}`).on('hidden.bs.toast', function() {
            const index = notificacoesAtivas.indexOf(notificacaoId);
            if (index > -1) {
                notificacoesAtivas.splice(index, 1);
            }
            $(this).remove();
        });
    }

    // Função para formatar tempo em segundos para HH:MM:SS
    function formatarTempoSegundos(segundos) {
        if (!segundos) return "00:00:00";
        const horas = Math.floor(segundos / 3600);
        const minutos = Math.floor((segundos % 3600) / 60);
        const segs = segundos % 60;
        return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
    }

    // --- Auth e API (com refresh) ---
    function getAuthToken() {
        return localStorage.getItem('authToken');
    }

    async function attemptTokenRefresh() {
        try {
            const response = await fetch('/api/auth/refresh-token', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                // Se o refresh token também estiver inválido, faz logout
                if (response.status === 401) {
                    console.warn('Refresh token inválido ou expirado');
                    await logoutUser();
                }
                return null;
            }

            const result = await response.json();
            if (result && result.accessToken) {
                localStorage.setItem('authToken', result.accessToken);
                console.log('Token renovado com sucesso');
                return result.accessToken;
            }
            return null;
        } catch (error) {
            console.error('Erro ao renovar token:', error);
            await logoutUser();
            return null;
        }
    }

    async function checkAndRefreshToken() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            // Tenta renovar o token se não houver um token válido
            const newToken = await attemptTokenRefresh();
            if (!newToken) {
                // Se não conseguir renovar, redireciona para o login
                window.location.href = '/index.html';
                return false;
            }
            return true;
        }

        // Verifica se o token está expirado ou prestes a expirar
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const now = Date.now() / 1000;

            // Se o token expirar nos próximos 5 minutos, tenta renovar
            if (payload.exp < now + 300) {
                console.log('Token prestes a expirar, renovando...');
                const newToken = await attemptTokenRefresh();
                return !!newToken;
            }

            return true;
        } catch (e) {
            console.error('Erro ao verificar token:', e);
            return false;
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        // Verificar se voltou do checkout Asaas
        const urlParams = new URLSearchParams(window.location.search);
        const pagamentoStatus = urlParams.get('pagamento');
        const reservaId = urlParams.get('reserva_id') || urlParams.get('reserva');
        const status = urlParams.get('status');

        // Tratar retorno do checkout Asaas
        if (pagamentoStatus || (reservaId && status)) {
            // Limpar os parâmetros da URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            if (pagamentoStatus === 'sucesso' || status === 'sucesso') {
                showAlertModal(null, 
                    '✅ Pagamento realizado com sucesso! Sua reserva foi confirmada.', 
                    'success'
                );
                
                // Ir para seção de reservas
                setTimeout(() => {
                    document.getElementById('reservasLink')?.click();
                }, 2000);
            } else if (pagamentoStatus === 'cancelado' || status === 'cancelado') {
                showAlertModal(null, 
                    '⚠️ Pagamento cancelado. Você pode tentar novamente.', 
                    'warning'
                );
            }
        }

        // Botão de localização no mapa
        const localizarMeBtn = document.getElementById('localizarMeBtn');
        if (localizarMeBtn) {
            localizarMeBtn.addEventListener('click', zoomToUserLocation);
        }

        // Navegação entre seções
        const navMapaLink = document.getElementById('nav-mapa-link');
        if (navMapaLink) {
            navMapaLink.addEventListener('click', (e) => {
                e.preventDefault();
                showMapaSection();
            });
        }

        // Botão de voltar ao mapa na seção de reservas
        const voltarMapaBtn = document.getElementById('voltarMapaBtn');
        if (voltarMapaBtn) {
            voltarMapaBtn.addEventListener('click', () => {
                showMapaSection();
            });
        }

        // Botão de favoritos na barra lateral
        const favoritosLink = document.getElementById('favoritosLink');
        if (favoritosLink) {
            favoritosLink.addEventListener('click', (e) => {
                e.preventDefault();
                showFavoritosSection();
            });
        }

        // Botão de voltar do favoritos
        const voltarMapaFavoritosBtn = document.getElementById('voltarMapaFavoritosBtn');
        if (voltarMapaFavoritosBtn) {
            voltarMapaFavoritosBtn.addEventListener('click', () => {
                // Forçar a ocultação da seção de favoritos primeiro
                document.getElementById('favoritosSection').style.display = 'none';

                // Pequeno atraso para garantir que a seção de favoritos seja ocultada antes de mostrar o mapa
                setTimeout(() => {
                    // Mostrar o mapa
                    document.getElementById('mapaContent').style.display = 'block';

                    // Atualizar as classes ativas
                    document.getElementById('nav-mapa').classList.add('active');
                    document.getElementById('nav-reservas').classList.remove('active');
                    document.getElementById('nav-favoritos').classList.remove('active');

                    // Atualizar o mapa
                    if (map) {
                        map.invalidateSize();
                    }
                }, 50);
            });
        }

        // Botão de reservas na barra lateral
        const reservasLink = document.getElementById('reservasLink');
        if (reservasLink) {
            reservasLink.addEventListener('click', (e) => {
                e.preventDefault();
                showReservasSection();
            });
        }

        // Carregar perfil do usuário
        await loadUserProfile();

        // Event listeners para o modal de perfil do usuário
        const editUserBtn = document.getElementById('editUserBtn');
        if (editUserBtn) {
            editUserBtn.addEventListener('click', () => toggleUserFormEdit(true));
        }

        const cancelEditBtn = document.getElementById('cancelEditBtn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', async () => {
                await loadUserProfile(); // Recarregar dados originais
                toggleUserFormEdit(false);
            });
        }

        const saveUserBtn = document.getElementById('saveUserBtn');
        if (saveUserBtn) {
            saveUserBtn.addEventListener('click', saveUserProfile);
        }

        // Evento para o input de busca
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    searchLocation();
                }
            });
        }

        // Botão de pesquisa
        const searchLocationBtn = document.getElementById('searchLocationBtn');
        if (searchLocationBtn) {
            searchLocationBtn.addEventListener('click', searchLocation);
        }
    });

    // Função para pesquisar localizações usando a barra de pesquisa existente
    function searchLocation() {
        try {
            // Obter o valor do campo de busca
            const searchInput = document.getElementById('searchInput');
            const searchValue = searchInput ? searchInput.value.trim() : '';

            // Verificar se há um valor de busca
            if (!searchValue) {
                showUserAlert('Digite um local ou endereço para buscar', 'warning');
                return;
            }

            // Verificar se o mapa está inicializado
            if (!map) {
                console.error('Mapa não inicializado');
                showUserAlert('Erro ao inicializar a busca. Tente recarregar a página.', 'error');
                return;
            }

            // Mostrar indicador de carregamento
            showUserAlert('Buscando localização...', 'info', 1500);

            // Usar o serviço Nominatim para buscar o endereço
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchValue)}&limit=1&countrycodes=br`)
                .then(response => response.json())
                .then(data => {
                    // Verificar se há resultados
                    if (!data || data.length === 0) {
                        showUserAlert('Nenhum resultado encontrado para: ' + searchValue, 'warning');
                        return;
                    }

                    // Pegar o primeiro resultado
                    const result = data[0];

                    // Extrair as coordenadas
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);

                    if (isNaN(lat) || isNaN(lon)) {
                        showUserAlert('Coordenadas inválidas no resultado da busca', 'error');
                        return;
                    }

                    // Criar um ponto com as coordenadas
                    const center = L.latLng(lat, lon);

                    // Centralizar o mapa no resultado
                    map.setView(center, 15); // Zoom level 15 é bom para cidades/bairros

                    // Adicionar um marcador temporário com animação
                    const searchMarker = L.marker(center).addTo(map)
                        .bindPopup(`<b>${escapeHtml(result.display_name)}</b>`)
                        .openPopup();

                    // Animação de pulso para o marcador
                    const iconElem = searchMarker.getElement();
                    if (iconElem) {
                        iconElem.style.animation = 'pulseAnimation 1.5s infinite';
                    }

                    // Remover o marcador após alguns segundos
                    setTimeout(() => {
                        if (iconElem) {
                            iconElem.style.animation = 'fadeInUp 0.5s reverse';
                        }
                        setTimeout(() => {
                            map.removeLayer(searchMarker);
                        }, 500);
                    }, 8000);

                    // Mostrar mensagem de sucesso
                    showUserAlert('Localização encontrada!', 'success');

                    // Limpar o campo de busca e remover o foco
                    if (searchInput) {
                        searchInput.blur(); // Remover o foco para esconder o teclado em dispositivos móveis
                    }

                    // Garantir que estamos na seção do mapa
                    showMapaSection();
                })
                .catch(error => {
                    console.error('Erro na busca de localização:', error);
                    showUserAlert('Erro ao buscar localização. Tente novamente.', 'error');
                });
        } catch (error) {
            console.error('Erro ao buscar localização:', error);
            showUserAlert('Erro ao buscar localização. Tente novamente.', 'error');
        }
    }

    // --- Socket.IO Client (Home) ---
    function connectHomeSocketIO() { const token=localStorage.getItem('authToken'); if(!token || !config.realtime.enabled) return; if(homeSocket?.connected) return; if(homeSocket) homeSocket.disconnect(); console.log('[Socket.IO Home] Conectando...'); homeSocket=io({auth:{token},reconnectionAttempts:5}); homeSocket.on('connect',()=>{console.log(`[Socket.IO Home] Conectado: ${homeSocket.id}`); subscribedRooms.forEach(id => homeSocket.emit('join_estacionamento', id));}); homeSocket.on('disconnect',(r)=>console.warn(`[Socket.IO Home] Desconectado: ${r}`)); homeSocket.on('connect_error',(err)=>{console.error(`[Socket.IO Home] Erro: ${err.message}`); if(err.message.includes("Auth"))logoutUser();}); homeSocket.on('vagas_livres_update',(data)=>{ console.log('[Socket.IO Home] Rx Vagas Livres:',data); const badge=document.getElementById(`livres-popup-${data.estacionamentoId}`); if(badge) badge.textContent=`Livres: ${data.vagasLivres}`; const modalInfo=document.getElementById('modalVagasInfo'); if(selEstId == data.estacionamentoId && modalInfo?.offsetParent !== null) modalInfo.textContent = `Vagas Livres Agora: ${data.vagasLivres}`; }); }
    function disconnectHomeSocketIO() { if (homeSocket) { homeSocket.disconnect(); homeSocket = null; console.log('[Socket.IO Home] Desconectado.'); } }
    function joinEstacionamentoRoom(estId) { if (homeSocket?.connected && estId && !subscribedRooms.has(estId)) { homeSocket.emit('join_estacionamento', estId); subscribedRooms.add(estId); console.log(`[Socket.IO Home] Entrou sala Est. ${estId}`); } }
    function leaveEstacionamentoRoom(estId) { if (homeSocket?.connected && estId && subscribedRooms.has(estId)) { homeSocket.emit('leave_estacionamento', estId); subscribedRooms.delete(estId); console.log(`[Socket.IO Home] Saiu sala Est. ${estId}`); } }


    // --- Mapa e Localização ---
    function initMap() {
    // Assign to both local and window.map for backward compatibility
    window.map = map = L.map('map', {zoomControl:false}).setView([-22.786,-45.184],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OSM'}).addTo(map);
    estMarkers.addTo(map);

    const geoLocationControl = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', 'leaflet-control-locate', container);
            button.href = '#';
            button.title = 'Minha Localização';
            button.innerHTML = '<i class="fas fa-map-marker-alt"></i>'; // Alterado para um ícone mais comum de localização

            L.DomEvent.on(button, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e); // Prevenir comportamento padrão do link
                getUserLocation(true); // Centralizar ao obter localização
            });

            return container;
        }
    });
    // map.addControl(new geoLocationControl()); // O botão #localizarMeBtn já existe, esta linha pode ser redundante ou alternativa.
                                               // Se #localizarMeBtn for usado, este controle customizado pode ser removido.
                                               // Mantendo por enquanto, mas atente-se para não ter dois botões com mesma função.

    // Remover qualquer controle de geocoder existente primeiro
    const geocoderContainer = document.querySelector('.leaflet-control-geocoder');
    if (geocoderContainer && geocoderContainer.parentNode) {
      geocoderContainer.parentNode.removeChild(geocoderContainer);
    }

    // Inicializar o serviço de geocodificação para ser usado com a barra de pesquisa existente
    geoCtrl = {
      options: {
        geocoder: L.Control.Geocoder.nominatim({
          serviceUrl: 'https://nominatim.openstreetmap.org/',
          geocodingQueryParams: {
            countrycodes: 'br', // Priorizar resultados do Brasil
            limit: 5, // Limitar número de resultados
            format: 'json'
          }
        })
      }
    };

    map.on('popupopen',(e)=>{ const btn=e.popup._contentNode.querySelector('button[onclick^="openInfoModal"]'); if(btn){ const idStr = btn.onclick.toString().match(/\(([^,)]+)/); if(idStr && idStr[1]){ const id = parseInt(idStr[1]); if(!isNaN(id)) joinEstacionamentoRoom(id);}}});
    map.on('popupclose',(e)=>{ const btn=e.popup._contentNode.querySelector('button[onclick^="openInfoModal"]'); if(btn){ const idStr = btn.onclick.toString().match(/\(([^,)]+)/); if(idStr && idStr[1]){ const id = parseInt(idStr[1]); if(!isNaN(id)) leaveEstacionamentoRoom(id);}}});
}
    function getUserLocation(center=false){
    if (!navigator.geolocation) {
        showUserAlert('Geolocalização não suportada.', 'warning');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        p => {
            const ll=[p.coords.latitude, p.coords.longitude];
            if(userMarker)userMarker.setLatLng(ll);
            else {
                const i=L.divIcon({
                    className:'user-location-icon',
                    html:'<i class="fas fa-street-view" style="color:#007bff;font-size:26px; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);"></i>',
                    iconSize:[26,26],
                    iconAnchor:[13,13]
                });
                userMarker=L.marker(ll,{icon:i}).addTo(map).bindPopup("Você está aqui");
            }
            if(center)map.setView(ll,15);
            if(center) showUserAlert('Localização obtida e mapa centralizado!', 'success'); else showUserAlert('Localização atualizada!', 'success');
        },
        e => {
            console.warn("Erro de Geolocalização:",e.message);
            showUserAlert('Erro ao obter localização: ' + e.message, 'danger');
        },
        {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
    );
}
    function zoomToUserLocation() {
        if(userMarker) {
            map.setView(userMarker.getLatLng(), 16);
            userMarker.openPopup();
        } else {
            getUserLocation(true);
        }
    }

    function searchLocation() {
        const q = document.getElementById('searchInput').value;
        if(!q) return;

        // Mostrar feedback visual de busca
        showUserAlert('Buscando localização...', 'info', 2000);

        try {
            // Garantir que estamos na seção do mapa
            showMapaSection();

            // Adicionar um pequeno atraso para garantir que o mapa esteja visível
            setTimeout(() => {
                // Forçar a atualização do tamanho do mapa
                if(map) map.invalidateSize();

                // Usar o serviço Nominatim para buscar o endereço
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=br`)
                    .then(response => response.json())
                    .then(data => {
                        // Verificar se há resultados
                        if (!data || data.length === 0) {
                            showUserAlert('Nenhum resultado encontrado para: ' + q, 'warning');
                            return;
                        }

                        // Pegar o primeiro resultado
                        const result = data[0];

                        // Extrair as coordenadas
                        const lat = parseFloat(result.lat);
                        const lon = parseFloat(result.lon);

                        if (isNaN(lat) || isNaN(lon)) {
                            showUserAlert('Coordenadas inválidas no resultado da busca', 'error');
                            return;
                        }

                        // Criar um ponto com as coordenadas
                        const center = L.latLng(lat, lon);

                        // Centralizar o mapa no resultado
                        map.setView(center, 15); // Zoom level 15 é bom para cidades/bairros

                        // Mostrar mensagem de sucesso
                        showUserAlert('Localização encontrada!', 'success');

                        // Limpar o campo de busca e remover o foco
                        const searchInput = document.getElementById('searchInput');
                        if (searchInput) {
                            searchInput.blur(); // Remover o foco para esconder o teclado em dispositivos móveis
                        }

                        // Garantir que estamos na seção do mapa
                        showMapaSection();
                    })
                    .catch(error => {
                        console.error('Erro na busca de localização:', error);
                        showUserAlert('Erro ao buscar localização. Tente novamente.', 'error');
                    });
            }, 300);
        } catch(e) {
            console.error('Erro ao buscar localização:', e);
            showUserAlert('Erro ao buscar localização.', 'danger');
        }
    }

    // --- Funções para alternar entre seções ---
    function showMapaSection() {
      // Atualizar classes ativas na barra lateral
      document.getElementById('nav-mapa').classList.add('active');
      document.getElementById('nav-reservas').classList.remove('active');
      document.getElementById('nav-favoritos').classList.remove('active');

      // Mostrar mapa e esconder outras seções
      document.getElementById('mapaContent').style.display = 'block';
      document.getElementById('reservasSection').style.display = 'none';
      document.getElementById('favoritosSection').style.display = 'none';

      // Atualizar mapa quando exibido
      if (window.map && typeof window.map.invalidateSize === 'function') {
        try {
          setTimeout(() => {
            if (window.map && typeof window.map.invalidateSize === 'function') {
              window.map.invalidateSize();
            }
          }, 100);
        } catch (e) {
          console.error('Error refreshing map:', e);
        }
      } else if (!window.map) {
        // If map is not initialized, try to initialize it
        if (typeof L !== 'undefined' && document.getElementById('map')) {
          initMap();
        }
      }
    }

    function showReservasSection() {
      // Atualizar classes ativas na barra lateral
      document.getElementById('nav-mapa').classList.remove('active');
      document.getElementById('nav-reservas').classList.add('active');
      document.getElementById('nav-favoritos').classList.remove('active');

      // Mostrar seção de reservas e esconder outras seções
      document.getElementById('mapaContent').style.display = 'none';
      document.getElementById('reservasSection').style.display = 'block';
      document.getElementById('favoritosSection').style.display = 'none';

      // Carregar as reservas ao mostrar a seção usando a função correta
      if (typeof loadMinhasReservas === 'function') {
        loadMinhasReservas();
      }
    }

    // Função para verificar se um estacionamento está nos favoritos
    function isFavorito(estacionamentoId) {
        const favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');
        return favoritos.some(f => f.id === estacionamentoId);
    }

    // Função para atualizar o estado dos botões de favorito nos popups
    function updateFavoriteBtns() {
        const favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');
        const favoritosIds = favoritos.map(f => f.id);

        // Atualizar os botões nos popups abertos
        document.querySelectorAll('.favoritar-btn').forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr) {
                const match = onclickAttr.match(/toggleFavorito\((\d+)/);
                if (match && match[1]) {
                    const estId = parseInt(match[1]);

                    if (favoritosIds.includes(estId)) {
                        btn.innerHTML = '<i class="fas fa-star"></i> Desfavoritar';
                        btn.classList.remove('btn-outline-warning');
                        btn.classList.add('btn-warning');
                    } else {
                        btn.innerHTML = '<i class="fas fa-star"></i> Favoritar';
                        btn.classList.remove('btn-warning');
                        btn.classList.add('btn-outline-warning');
                    }
                }
            }
        });
    }

    // Função para carregar e exibir os favoritos
    function loadFavoritos() {
        const container = document.getElementById('listaFavoritosContainer');
        if (!container) return;

        // Recuperar favoritos do localStorage
        const favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');

        // Se não houver favoritos
        if (favoritos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-star mb-3" style="font-size: 3rem; color: var(--text-muted);"></i>
                    <h5 class="mb-3">Você ainda não tem favoritos</h5>
                    <p class="text-muted">Explore o mapa e adicione estacionamentos aos seus favoritos.</p>
                    <button class="btn btn-voltar mt-3" onclick="showMapaSection()"><i class="fas fa-map-marked-alt mr-2"></i> Explorar Mapa</button>
                </div>
            `;
            return;
        }

        // Ordenar favoritos por data de criação (mais recentes primeiro)
        favoritos.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

        // Renderizar lista de favoritos
        let html = '<ul class="list-group list-unstyled">';

        favoritos.forEach(f => {
            html += `
                <li class="list-group-item">
                    <div>
                        <h5>${escapeHtml(f.nome)}</h5>
                        <p><i class="fas fa-map-marker-alt mr-1"></i> ${escapeHtml(f.endereco || 'Endereço não disponível')}</p>
                    </div>
                    <div class="favorito-acoes">
                        <button class="btn btn-sm btn-outline-primary" onclick="handleNavigate(${Number(f.id)}, ${jsArg(f.nome)}, ${Number(f.latitude)}, ${Number(f.longitude)})">
                            <i class="fas fa-directions mr-1"></i> Navegar
                        </button>
                        <button class="btn btn-sm btn-info" onclick="openInfoModal(${Number(f.id)}, ${jsArg(f.nome)}, ${jsArg(f.endereco)})">
                            <i class="fas fa-calendar-alt mr-1"></i> Info/Reservar
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="toggleFavorito(${Number(f.id)}, ${jsArg(f.nome)}, ${jsArg(f.endereco)}, ${Number(f.latitude)}, ${Number(f.longitude)})">
                            <i class="fas fa-star mr-1"></i> Remover
                        </button>
                    </div>
                </li>
            `;
        });

        html += '</ul>';
        container.innerHTML = html;
    }

    // Função para adicionar/remover estacionamento dos favoritos
    function toggleFavorito(id, nome, endereco, latitude, longitude) {
        // Recuperar favoritos do localStorage
        let favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');

        // Verificar se o estacionamento já está nos favoritos
        const index = favoritos.findIndex(f => f.id === id);

        if (index !== -1) {
            // Remover dos favoritos
            favoritos.splice(index, 1);
            showUserAlert(`${nome} removido dos favoritos!`, 'warning');
        } else {
            // Adicionar aos favoritos
            favoritos.push({
                id: id,
                nome: nome,
                endereco: endereco,
                latitude: latitude,
                longitude: longitude,
                dataCriacao: new Date().toISOString()
            });
            showUserAlert(`${nome} adicionado aos favoritos!`, 'success');
        }

        // Salvar no localStorage
        localStorage.setItem('favoritos', JSON.stringify(favoritos));

        // Atualizar a lista de favoritos se estiver visível
        if (document.getElementById('favoritosSection').style.display !== 'none') {
            loadFavoritos();
        }

        // Atualizar o estado do botão de favorito nos popups
        updateFavoriteBtns();

        // Fechar todos os popups abertos
        map.closePopup();

        // Recarregar os marcadores do mapa para atualizar os popups
        if (typeof loadEstacionamentos === 'function') {
            loadEstacionamentos();
        }
    }

    // Função para atualizar o estado dos botões de favorito nos popups
    function updateFavoriteBtns() {
        const favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');
        const favoritosIds = favoritos.map(f => f.id);

        // Atualizar os botões nos popups abertos
        document.querySelectorAll('.favoritar-btn').forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr) {
                const match = onclickAttr.match(/toggleFavorito\((\d+)/);
                if (match && match[1]) {
                    const estId = parseInt(match[1]);

                    if (favoritosIds.includes(estId)) {
                        btn.innerHTML = '<i class="fas fa-star"></i> Desfavoritar';
                        btn.classList.remove('btn-outline-warning');
                        btn.classList.add('btn-warning');
                    } else {
                        btn.innerHTML = '<i class="fas fa-star"></i> Favoritar';
                        btn.classList.remove('btn-warning');
                        btn.classList.add('btn-outline-warning');
                    }
                }
            }
        });
    }

    // Função para carregar e exibir os favoritos
    function loadFavoritos() {
        const container = document.getElementById('listaFavoritosContainer');
        if (!container) return;

        // Recuperar favoritos do localStorage
        const favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');

        // Se não houver favoritos
        if (favoritos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-star mb-3" style="font-size: 3rem; color: var(--text-muted);"></i>
                    <h5 class="mb-3">Você ainda não tem favoritos</h5>
                    <p class="text-muted">Explore o mapa e adicione estacionamentos aos seus favoritos.</p>
                    <button class="btn btn-voltar mt-3" onclick="showMapaSection()"><i class="fas fa-map-marked-alt mr-2"></i> Explorar Mapa</button>
                </div>
            `;
            return;
        }

        // Ordenar favoritos por data de criação (mais recentes primeiro)
        favoritos.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

        // Renderizar lista de favoritos
        let html = '<ul class="list-group list-unstyled">';

        favoritos.forEach(f => {
            html += `
                <li class="list-group-item">
                    <div>
                        <h5>${escapeHtml(f.nome)}</h5>
                        <p><i class="fas fa-map-marker-alt mr-1"></i> ${escapeHtml(f.endereco || 'Endereço não disponível')}</p>
                    </div>
                    <div class="favorito-acoes">
                        <button class="btn btn-sm btn-outline-primary" onclick="handleNavigate(${Number(f.id)}, ${jsArg(f.nome)}, ${Number(f.latitude)}, ${Number(f.longitude)})">
                            <i class="fas fa-directions mr-1"></i> Navegar
                        </button>
                        <button class="btn btn-sm btn-info" onclick="openInfoModal(${Number(f.id)}, ${jsArg(f.nome)}, ${jsArg(f.endereco)})">
                            <i class="fas fa-calendar-alt mr-1"></i> Info/Reservar
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="toggleFavorito(${Number(f.id)}, ${jsArg(f.nome)}, ${jsArg(f.endereco)}, ${Number(f.latitude)}, ${Number(f.longitude)})">
                            <i class="fas fa-star mr-1"></i> Remover
                        </button>
                    </div>
                </li>
            `;
        });

        html += '</ul>';
        container.innerHTML = html;
    }

    // Função para carregar reservas do usuário
    async function loadReservas() {
      const container = document.getElementById('listaReservasContainer');
      if (!container) return;

      try {
        // Mostrar estado de carregamento
        container.innerHTML = `
          <div class="reservas-loading">
            <div class="spinner-container">
              <i class="fas fa-spinner fa-spin"></i>
            </div>
            <p>Carregando suas reservas...</p>
          </div>
        `;

        // Carregar dados da API
        const reservas = await fetchWithAuth('/api/reservas/minhas');

        // Se não houver reservas
        if (!reservas || reservas.length === 0) {
          container.innerHTML = `
            <div class="text-center py-5">
              <i class="fas fa-calendar-times mb-3" style="font-size: 3rem; color: var(--text-muted);"></i>
              <h5 class="mb-3">Você ainda não possui reservas</h5>
              <p class="text-muted">Explore o mapa e reserve uma vaga em um estacionamento próximo.</p>
              <button class="btn btn-voltar mt-3" onclick="showMapaSection()"><i class="fas fa-map-marked-alt mr-2"></i> Explorar Mapa</button>
            </div>
          `;
          return;
        }

        // Renderizar lista de reservas
        let html = '<ul class="list-group list-unstyled">';

        reservas.forEach(r => {
          // Determinar status e classe do badge
          let statusText = 'Agendada';
          let badgeClass = 'badge-success';

          if (r.status === 'cancelada') {
            statusText = 'Cancelada';
            badgeClass = 'badge-danger';
          } else if (r.status === 'concluida') {
            statusText = 'Concluída';
            badgeClass = 'badge-secondary';
          } else if (r.status === 'em_andamento') {
            statusText = 'Em Andamento';
            badgeClass = 'badge-warning';
          }

          // Formatar datas
          const dataInicio = new Date(r.data_inicio);
          const dataFim = new Date(r.data_fim);
          const dataFormatada = dataInicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const horaInicio = dataInicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const horaFim = dataFim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          html += `
            <li class="list-group-item">
              <div>
                <h5>${escapeHtml(r.nome_estacionamento)}</h5>
                <p><i class="fas fa-map-marker-alt mr-1"></i> ${escapeHtml(r.endereco_estacionamento || 'Endereço não disponível')}</p>
                <p><i class="far fa-calendar-alt mr-1"></i> <strong>${dataFormatada}</strong> das <strong>${horaInicio}</strong> às <strong>${horaFim}</strong></p>
                <span class="badge ${badgeClass}">${statusText}</span>
              </div>
              <div>
                ${r.status === 'agendada' ? `<button class="btn btn-sm btn-outline-danger" onclick="cancelarReserva(${r.id})"><i class="fas fa-times mr-1"></i> Cancelar</button>` : ''}
                <button class="btn btn-sm btn-outline-primary" onclick="verDetalhesReserva(${r.id})"><i class="fas fa-info-circle mr-1"></i> Detalhes</button>
              </div>
            </li>
          `;
        });

        html += '</ul>';
        container.innerHTML = html;

      } catch (error) {
        console.error('Erro ao carregar reservas:', error);
        container.innerHTML = `
          <div class="alert alert-danger">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            Não foi possível carregar suas reservas. Tente novamente mais tarde.
            <button class="btn btn-sm btn-outline-danger mt-2" onclick="loadReservas()">Tentar Novamente</button>
          </div>
        `;
      }
    }

    // --- Estacionamentos ---
    async function loadEstacionamentos() {
        console.log('Iniciando carregamento de estacionamentos...');
        try {
            const data = await fetchWithAuth('/api/estacionamentos');
            console.log('Dados recebidos da API:', data);
            if (data && Array.isArray(data)) {
                console.log(`Encontrados ${data.length} estacionamentos`);
                addEstacionamentoMarkers(data);
            } else {
                console.error('Dados de estacionamentos inválidos:', data);
                showUserAlert('Dados de estacionamentos inválidos recebidos do servidor.', 'warning');
            }
        } catch (e) {
            console.error("Falha ao carregar estacionamentos:", e);
            showUserAlert('Falha ao carregar estacionamentos. Verifique sua conexão e tente novamente.', 'danger');
        }
    }

    function addEstacionamentoMarkers(estList) {
        console.log('Adicionando marcadores para', estList.length, 'estacionamentos');
        estMarkers.clearLayers();

        // Contadores para relatório
        let marcadoresAdicionados = 0;
        let semCoordenadas = 0;

        // Função para criar ícones personalizados com cores diferentes
        function createParkingIcon(status, vagasLivres, vagasTotal) {
            // Determinar a cor do ícone com base no status
            let iconColor;
            let badgeClass;
            let statusText;

            // Status específicos primeiro
            if (status === 'manutencao') {
                iconColor = 'gray'; // Estacionamento em manutenção
                badgeClass = 'secondary';
                statusText = 'Em Manutenção';
            }
            // Verificar por número de vagas
            else if (status === 'lotado' || vagasLivres === 0) {
                iconColor = 'red'; // Estacionamento lotado
                badgeClass = 'danger';
                statusText = 'Lotado';
            }
            // Calcular porcentagem de ocupação se tivermos o total de vagas
            else if (vagasTotal && vagasLivres !== null) {
                const ocupacaoPercent = ((vagasTotal - vagasLivres) / vagasTotal) * 100;

                if (ocupacaoPercent >= 80) { // 80% ou mais ocupado = poucas vagas
                    iconColor = 'yellow';
                    badgeClass = 'warning';
                    statusText = 'Poucas Vagas';
                } else { // Menos de 80% ocupado = tranquilo
                    iconColor = 'green';
                    badgeClass = 'success';
                    statusText = 'Tranquilo';
                }
            }
            // Se não temos o total, usar número absoluto de vagas livres
            else if (vagasLivres !== null) {
                if (vagasLivres < 5) { // Menos de 5 vagas = poucas vagas
                    iconColor = 'yellow';
                    badgeClass = 'warning';
                    statusText = 'Poucas Vagas';
                } else { // 5 ou mais vagas = tranquilo
                    iconColor = 'green';
                    badgeClass = 'success';
                    statusText = 'Tranquilo';
                }
            }
            // Fallback para casos onde não temos informação suficiente
            else {
                iconColor = 'green'; // Padrão para verde
                badgeClass = 'success';
                statusText = 'Disponível';
            }

            // Criar um elemento div para o ícone personalizado
            return {
                iconColor: iconColor,
                badgeClass: badgeClass,
                statusText: statusText,
                icon: L.divIcon({
                    className: `custom-parking-icon ${iconColor}`,
                    html: `<div class="parking-marker ${iconColor}"><i class="fas fa-parking"></i></div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40],
                    popupAnchor: [0, -35]
                })
            };
        }
        estList.forEach(e => {
            // Verificar se as coordenadas são válidas
            if (e.latitude === null || e.longitude === null ||
                isNaN(parseFloat(e.latitude)) || isNaN(parseFloat(e.longitude))) {
                console.warn(`Estacionamento "${e.nome || 'Sem nome'}" não possui coordenadas válidas.`);
                semCoordenadas++;
                return; // Pula para o próximo estacionamento
            }

            // Se chegou aqui, as coordenadas são válidas
            console.log(`Adicionando marcador para: "${e.nome}" em (${e.latitude}, ${e.longitude})`);
            marcadoresAdicionados++;

            try {
                // Obter informações do estacionamento
                const vagasLivres = e.vagas_livres_agora !== undefined ? e.vagas_livres_agora : null;
                const vagasTotal = e.vagas_total || null;

                // Usar o status do backend se disponível, senão calcular localmente
                const status = e.statusOcupacao?.status ||
                              (e.estaAberto === false ? 'fechado' :
                              (vagasLivres === 0 ? 'lotado' : null));

                // Criar ícone personalizado com base no status
                const iconData = createParkingIcon(status, vagasLivres, vagasTotal);

                // Criar o marcador no mapa
                const marker = L.marker([e.latitude, e.longitude], {
                    icon: iconData.icon,
                    properties: e // Adicionar propriedades ao marcador
                }).addTo(estMarkers);

                const nomeEstacionamento = e.nome ? e.nome.replace(/'/g, "\\'") : 'Estacionamento';
                const enderecoEstacionamento = e.endereco ? e.endereco.replace(/'/g, "\\'") : 'Endereço não disponível';

                // Verificar se está nos favoritos
                const eFavorito = isFavorito(e.id);
                const favoritoTexto = eFavorito ? 'Desfavoritar' : 'Favoritar';
                const favoritoClasse = eFavorito ? 'btn-warning' : 'btn-outline-warning';

                // HTML da foto se existir
                const fotoHtml = e.foto ? `
                    <div class="popup-image" style="margin-bottom: 10px;">
                        <img src="${escapeHtml(e.foto)}" alt="${escapeHtml(e.nome)}"
                             style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 8px; border: 2px solid #ddd;"
                             onerror="this.parentElement.style.display='none'">
                    </div>
                ` : '';

                const popupContent = `
                    ${fotoHtml}
                    <b>${escapeHtml(e.nome || 'Estacionamento')}</b>
                    <p class="small text-muted mb-1">${escapeHtml(e.endereco || 'Endereço não disponível')}</p>
                    <div class="popup-status">
                        <span id="status-popup-${e.id}" class="badge badge-${iconData.badgeClass} mr-2">${iconData.statusText}</span>
                        <span id="livres-popup-${e.id}" class="badge badge-${iconData.badgeClass}">Vagas: ${e.vagas_livres_agora ?? '?'}${e.total_vagas ? '/' + e.total_vagas : ''}</span>
                    </div>
                    <div class="popup-actions">
                        <button class="btn btn-sm btn-outline-primary"
                                onclick="handleNavigate(${e.id}, '${nomeEstacionamento}', ${e.latitude}, ${e.longitude})"
                                title="Navegar">
                            <i class="fas fa-directions"></i> Navegar
                        </button>
                        <button class="btn btn-sm ${favoritoClasse} favoritar-btn"
                                onclick="toggleFavorito(${e.id}, '${nomeEstacionamento}', '${enderecoEstacionamento}', ${e.latitude}, ${e.longitude})"
                                title="${favoritoTexto}">
                            <i class="fas fa-star"></i> ${favoritoTexto}
                        </button>
                        <button class="btn btn-sm btn-info"
                                onclick="openInfoModal(${e.id}, '${nomeEstacionamento}', '${enderecoEstacionamento}')"
                                title="Informações e Reserva">
                            <i class="fas fa-calendar-alt"></i> Info/Reservar
                        </button>
                    </div>`;
                marker.bindPopup(popupContent);
            } catch (error) {
                console.error('Erro ao adicionar marcador para o estacionamento:', e.nome, error);
                semCoordenadas++; // Conta como falha
            }
        });

        // Mostrar relatório
        if (marcadoresAdicionados === 0 && estList.length > 0) {
            showUserAlert('Nenhum estacionamento com localização válida encontrado. Por favor, entre em contato com o suporte.', 'warning');
        } else if (semCoordenadas > 0) {
            console.warn(`${semCoordenadas} estacionamento(s) não foram exibidos por falta de coordenadas.`);
            showUserAlert(`${marcadoresAdicionados} estacionamento(s) carregados. ${semCoordenadas} não possuem localização.`, 'info');
        } else {
            console.log(`Marcadores adicionados com sucesso: ${marcadoresAdicionados}`);
        }
    }


    // --- Modal Info/Reserva ---
    async function openInfoModal(id, nome='Carregando...', end='...') {
    selEstId=id;
    $('#modalEstacionamentoNome').text(nome);
    $('#modalEstacionamentoEndereco').text(end);
    $('#modalVagasInfo').html('<i class="fas fa-spinner fa-spin"></i> Verificando vagas...');
    $('#verVagasBtn').data('estacionamentoId', id);
    $('#reservarVagaBtn').data('estacionamentoId', id);
    hideAlertModal('reserva-feedback');

    // Atualizar o estado dos botões de favorito nos popups
    setTimeout(() => updateFavoriteBtns(), 100);

    // Limpar e resetar o dropdown de vagas
    const vagaSelect = $('#reservaVagaId');
    vagaSelect.empty();
    vagaSelect.append('<option value="">Carregando vagas...</option>');

    // Configurar data/hora mínima (10 minutos no futuro) com fuso horário local
    const agora = new Date();
    const inicioDef = new Date(agora.getTime() + 10 * 60000); // 10 minutos no futuro

    // Formatar a data/hora no formato YYYY-MM-DDThh:mm compatível com datetime-local
    const ano = inicioDef.getFullYear();
    const mes = String(inicioDef.getMonth() + 1).padStart(2, '0');
    const dia = String(inicioDef.getDate()).padStart(2, '0');
    const hora = String(inicioDef.getHours()).padStart(2, '0');
    const minuto = String(inicioDef.getMinutes()).padStart(2, '0');

    const dataHoraFormatada = `${ano}-${mes}-${dia}T${hora}:${minuto}`;

    // Definir o valor mínimo e atual do campo de data/hora
    $('#reservaInicio').val(dataHoraFormatada).attr('min', dataHoraFormatada);
    $('#reservaDuracao').val('60');

    // Configurar manipulador de eventos para o botão de fechar
    $('#agendamentoModal .close, #agendamentoModal [data-dismiss="modal"]').off('click').on('click', function() {
        $('#agendamentoModal').modal('hide');
    });

    // Mostrar o modal enquanto carregamos os dados
    $('#agendamentoModal').modal('show');

    // Buscar informações de vagas livres e vagas disponíveis para reserva
    fetchVagasLivresParaModal(id);
    fetchVagasDisponiveisParaReserva(id);
}
    async function fetchVagasLivresParaModal(id) {
    try {
        const data = await fetchWithAuth(`/api/estacionamentos/vagas/livres?estacionamentoId=${id}`);
        if (data?.vagasLivres !== undefined) $('#modalVagasInfo').text(`Vagas Livres Agora: ${data.vagasLivres}`);
        else $('#modalVagasInfo').text('Informação de vagas indisponível.');
    } catch (e) {
        $('#modalVagasInfo').text('Erro ao verificar vagas.');
    }
}

// Função para buscar vagas disponíveis para reserva
async function fetchVagasDisponiveisParaReserva(estacionamentoId) {
    try {
        // Buscar vagas disponíveis para o estacionamento selecionado
        const data = await fetchWithAuth(`/api/estacionamentos/${estacionamentoId}/vagas?status=livre`);
        const vagaSelect = $('#reservaVagaId');

        // Limpar o dropdown
        vagaSelect.empty();
        vagaSelect.append('<option value="">Carregando vagas...</option>');

        // Se não houver vagas disponíveis
        if (!data || !data.length) {
            vagaSelect.append('<option value="" disabled>Nenhuma vaga disponível para reserva</option>');
            showAlertModal('reserva-feedback', 'Não há vagas disponíveis para reserva neste momento.', 'warning');
            return;
        }

        // Adicionar cada vaga ao dropdown
        data.forEach(vaga => {
            vagaSelect.append(`<option value="${Number(vaga.id)}">Vaga ${escapeHtml(vaga.numero)} - ${escapeHtml(vaga.tipo || 'Normal')}</option>`);
        });

    } catch (e) {
        console.error('Erro ao buscar vagas disponíveis:', e);
        const vagaSelect = $('#reservaVagaId');
        vagaSelect.empty();
        vagaSelect.append('<option value="">Erro ao carregar vagas</option>');
        showAlertModal('reserva-feedback', `Erro ao buscar vagas: ${e?.data?.message || e.message}`, 'danger');
    }
}

    // *** FUNÇÃO HANDLE NAVIGATE CORRIGIDA E MELHORADA ***
    function handleNavigate(estIdParam = null, estNomeParam = null, estLatParam = null, estLngParam = null) {
        console.log('handleNavigate called with:', { estIdParam, estNomeParam, estLatParam, estLngParam });
        let selectedEst = null;

        if (estLatParam !== null && estLngParam !== null) {
            // Parâmetros diretos fornecidos (ex: do popup)
            selectedEst = {
                id: estIdParam,
                nome: estNomeParam || 'o destino selecionado',
                latitude: estLatParam,
                longitude: estLngParam
            };
            console.log('Selected from direct parameters:', selectedEst);
        } else {
            // Sem coordenadas diretas, tentar fallback (ex: de um botão que usa selEstId ou outro contexto)
            const currentContextEstId = selEstId || $('#verVagasBtn').data('estacionamentoId'); // selEstId é mais confiável se o modal está aberto
            console.log('Fallback: Attempting to use context Estacionamento ID:', currentContextEstId);

            if (!currentContextEstId) {
                showUserAlert('Primeiro selecione um estacionamento para navegar.', 'warning');
                return;
            }

            const markers = estMarkers.getLayers();
            const markerFound = markers.find(layer =>
                layer.options.properties && layer.options.properties.id === parseInt(currentContextEstId)
            );

            if (markerFound && markerFound.options.properties) {
                const props = markerFound.options.properties;
                selectedEst = {
                    id: props.id,
                    nome: props.nome || 'o destino selecionado',
                    latitude: props.latitude,
                    longitude: props.longitude
                };
                console.log('Selected from fallback (marker data):', selectedEst);
            } else {
                console.warn(`Estacionamento com ID ${currentContextEstId} não encontrado nos markers ou sem propriedades de coordenadas.`);
            }
        }

        if (!selectedEst || selectedEst.latitude === null || selectedEst.longitude === null) {
            showUserAlert('Não foi possível determinar as coordenadas do estacionamento. Tente selecionar novamente.', 'danger');
            return;
        }

        if (!confirm(`Iniciar navegação para ${selectedEst.nome}?`)) {
            return;
        }

        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    const destLat = selectedEst.latitude;
                    const destLng = selectedEst.longitude;

                    console.log('Navegação:', { origem: { latitude, longitude }, destino: { lat: destLat, lng: destLng } });
                    
                    // Usar OpenStreetMap com roteamento OSRM
                    // Formato: https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=lat1,lon1;lat2,lon2
                    const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${latitude},${longitude};${destLat},${destLng}#map=15/${destLat}/${destLng}`;
                    console.log('OpenStreetMap Navigation URL:', osmUrl);
                    
                    // Abrir em nova aba
                    window.open(osmUrl, '_blank');
                },
                (error) => {
                    console.error('Erro ao obter localização para navegação:', error);
                    showUserAlert('Não foi possível obter sua localização para iniciar a navegação. Verifique as permissões e tente novamente.', 'danger');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 } // Obter localização fresca
            );
        } else {
            showUserAlert('Geolocalização não é suportada pelo seu navegador.', 'warning');
        }
    }

    $('#verVagasBtn').on('click', function() {
        const id=$(this).data('estacionamentoId');
        if(id) window.location.href = `/user/estacionamento.html?estacionamentoId=${id}`;
    });
    $('#reservarVagaBtn').on('click', handleReservarVaga);
    // A linha abaixo refere-se a um botão que não existe no HTML.
    // Se for adicionado um botão com id="navigateToVagaBtn" (ex: no modal), ele usaria o fallback de handleNavigate.
    // $('#navigateToVagaBtn').on('click', handleNavigate);

    // Função para exibir o modal de pagamento PIX
    function showPixPaymentModal(pixData) {
        // Criar o conteúdo do modal de pagamento com design responsivo
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

                            <!-- QR Code Container Responsivo -->
                            <div class="qr-code-container mb-3" style="display: flex; justify-content: center; align-items: center;">
                                <img src="${escapeHtml(pixData.qr_code)}"
                                     alt="QR Code PIX"
                                     class="img-fluid"
                                     style="max-width: min(250px, 80vw); height: auto; border: 2px solid #004080; border-radius: 8px; padding: 10px; background: white;">
                            </div>

                            <!-- Código PIX -->
                            <div class="mb-3">
                                <label class="form-label small text-muted">Ou copie o código PIX:</label>
                                <div class="input-group">
                                    <input type="text"
                                           id="pixCode"
                                           class="form-control form-control-sm"
                                           value="${pixData.qr_code_text}"
                                           readonly
                                           style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis;">
                                    <button class="btn btn-outline-primary btn-sm"
                                            type="button"
                                            id="copyPixCode"
                                            data-reserva-id="${pixData.reserva_id}">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Alerta de Tempo -->
                            <div class="alert alert-warning d-flex align-items-center py-2" role="alert" style="font-size: 0.9rem;">
                                <i class="fas fa-clock me-2"></i>
                                <div>
                                    <strong>Atenção:</strong> Você tem <strong>30 minutos</strong> para realizar o pagamento.
                                </div>
                            </div>

                            <!-- Feedback de Cópia -->
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

        // Criar e exibir o modal
        const modalId = 'pixPaymentModal';
        let modal = document.getElementById(modalId);

        // Se o modal já existe, remova-o
        if (modal) {
            modal.remove();
        }

        // Criar o modal
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = '-1';
        modal.role = 'dialog';
        modal.innerHTML = modalContent;

        // Adicionar o modal ao body
        document.body.appendChild(modal);

        // Inicializar o modal
        $(`#${modalId}`).modal('show');

        // Configurar o botão de copiar código PIX
        $(`#${modalId} #copyPixCode`).on('click', async function() {
            const pixCode = document.getElementById('pixCode');
            const reservaId = $(this).data('reserva-id');
            pixCode.select();
            document.execCommand('copy');

            // Mostrar feedback visual
            const originalText = $(this).html();
            $(this).html('<i class="fas fa-check"></i> Copiado!');

            // Mostrar feedback de sucesso
            $('#pixCopyFeedback').fadeIn();

            // Enviar notificação para o estacionamento
            try {
                await fetchWithAuth(`/api/reservas/${reservaId}/notificar-pagamento`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        tipo: 'pix_copiado',
                        codigoPix: pixData.qr_code_text, // Incluindo o código PIX no corpo da requisição
                        timestamp: new Date().toISOString()
                    })
                });
                console.log('Notificação de pagamento enviada com sucesso');
            } catch (error) {
                console.error('Erro ao enviar notificação de pagamento:', error);
            }

            // Restaurar texto original após 2 segundos
            setTimeout(() => {
                $(this).html(originalText);
            }, 2000);
        });

        // Configurar o botão de confirmar pagamento
        $(`#${modalId} #confirmarPagamento`).on('click', function() {
            // Fechar o modal sem redirecionar
            $(`#${modalId}`).modal('hide');
            showUserAlert('Aguardando confirmação do pagamento. Você pode acompanhar na aba "Minhas Reservas".', 'info');
        });

        // Verificar o status do pagamento a cada 10 segundos
        const checkPaymentStatus = setInterval(async () => {
            try {
                const response = await fetchWithAuth(`/api/pagamentos/${pixData.payment_id}/status`);
                if (response.status === 'approved') {
                    clearInterval(checkPaymentStatus);
                    showUserAlert('Pagamento aprovado! Sua reserva foi confirmada.', 'success');
                    $(`#${modalId}`).modal('hide');
                    // Atualizar a lista de reservas se a aba estiver aberta
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

        // Limpar o intervalo quando o modal for fechado
        $(`#${modalId}`).on('hidden.bs.modal', function () {
            clearInterval(checkPaymentStatus);
            $(this).remove();
        });
    }

    async function handleReservarVaga() {
        const btn = document.getElementById('reservarVagaBtn');
        showLoadingModal('agendamentoModal', true, '#reservarVagaBtn');
        hideAlertModal('reserva-feedback');

        try {
            const estId = $(btn).data('estacionamentoId');
            const inicio = $('#reservaInicio').val();
            const duracao = $('#reservaDuracao').val();
            const vagaId = $('#reservaVagaId').val();

            if (!estId || !inicio || !duracao || new Date(inicio) <= new Date(Date.now() + 60000)) {
                throw new Error('Selecione data/hora futura (mín 1 min).');
            }

            if (!vagaId) {
                throw new Error('Selecione uma vaga para reservar.');
            }

            // Calcular data de saída com base na duração
            const dataEntrada = new Date(inicio);
            const dataSaida = new Date(dataEntrada.getTime() + (parseInt(duracao) * 60 * 1000));

            // Obter o valor da vaga (você pode precisar ajustar isso para obter o valor real)
            const valor = 10.00; // Valor padrão, substitua pelo valor real

            const reservaData = {
                estacionamento_id: estId,
                vaga_id: parseInt(vagaId),
                data_entrada: dataEntrada.toISOString(),
                data_saida: dataSaida.toISOString(),
                valor: valor,
                metodo_pagamento: 'pix',
                status: 'pendente',
                usuario_id: localStorage.getItem('userId'),
                veiculo_placa: userData?.placa_veiculo || '',
                veiculo_modelo: userData?.tipo_veiculo || '',
                observacoes: 'Reserva via aplicativo',
                pagador_nome: userData?.nome || '',
                pagador_email: userData?.email || '',
                pagador_cpf: userData?.cpf || ''
            };

            console.log('Enviando dados para a API:', reservaData);

            // Enviar requisição para criar reserva com pagamento
            const result = await fetchWithAuth('/api/reservas/com-pagamento', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(reservaData)
            });

            // Fechar o modal de agendamento
            $('#agendamentoModal').modal('hide');

            // Extrair dados da resposta (PIX manual — always free)
            const reservaId = parseInt(result.reserva?.id || result.data?.reserva?.id) || 0;
            const pagamentoInfo = result.pagamento || result.data?.pagamento || {};
            const pixInfo = result.pix || result.data?.pix || {};

            const pixData = preparePixModalData(reservaId, {
              qr_code_base64: pixInfo.qr_code_base64 || pagamentoInfo.qr_code_base64,
              qr_code_text: pixInfo.qr_code_text || pixInfo.qr_code || pagamentoInfo.qr_code,
              pagamento_id: pagamentoInfo.id,
              valor: result.reserva?.valor_total || reservaData.valor,
              chave_pix: pixInfo.chave_pix,
              nome_titular: pixInfo.nome_titular,
              expira_em: pixInfo.expira_em || pagamentoInfo.expira_em,
            });

      showPixPaymentModal(pixData);

            // Notifica o estacionamento que o usuário visualizou o código PIX
            if (reservaId) {
                try {
                    await fetchWithAuth(`/api/reservas/${reservaId}/notificar-pagamento`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tipo: 'pix_visualizado',
                            codigoPix: pixData.qr_code_text,
                            timestamp: new Date().toISOString()
                        })
                    });
                } catch (error) {
                    console.error('Erro ao notificar visualização do PIX:', error);
                }
            }
        } catch(e) {
            showAlertModal('reserva-feedback', `Erro: ${e?.data?.message || e.message}`, 'danger');
        } finally {
            showLoadingModal('agendamentoModal', false, '#reservarVagaBtn');
        }
    }

    // --- Seção Minhas Reservas ---
    const mapaContent = document.getElementById('mapaContent'); const reservasSection = document.getElementById('reservasSection'); const reservasLink = document.getElementById('reservasLink'); const voltarMapaBtn = document.getElementById('voltarMapaBtn'); const listaReservasContainer = document.getElementById('listaReservasContainer');

    function showMapaSection() {
      // Hide all sections first
      document.getElementById('reservasSection').style.display='none';
      document.getElementById('favoritosSection').style.display='none';
      document.getElementById('mapaContent').style.display='block';

      // Update active navigation
      document.querySelectorAll('.sidebar nav li').forEach(l=>l.classList.remove('active'));
      document.querySelector('#nav-mapa').classList.add('active');

      // Refresh map if needed
      if(map) map.invalidateSize();
    }
    // Função para renderizar uma lista de reservas
    function renderReservasList(reservas, containerId, showActions = true) {
        console.log('[DEBUG] renderReservasList() chamada com:', { reservas, containerId, showActions });
        const container = document.getElementById(containerId);
        console.log('[DEBUG] Container encontrado:', container);

        if (!container) {
            console.error('[DEBUG] Container não encontrado:', containerId);
            return;
        }

        if (!reservas || reservas.length === 0) {
            console.log('[DEBUG] Nenhuma reserva encontrada, mostrando mensagem vazia');
            const emptyMessage = containerId.includes('Historico') ?
                'Nenhuma reserva no histórico.' :
                'Você não possui nenhuma reserva ativa.';

            const emptyIcon = containerId.includes('Historico') ? 'history' : 'calendar-times';

            container.innerHTML = `
                <div class="text-center p-5">
                    <i class="fas fa-${emptyIcon}" style="font-size: 4rem; color: #ccc; margin-bottom: 1.5rem;"></i>
                    <h5 class="text-muted mb-2">${emptyMessage}</h5>
                    <p class="text-muted small">
                        ${containerId.includes('Historico') ?
                            'Reservas canceladas ou concluídas aparecerão aqui.' :
                            'Faça uma reserva para começar!'}
                    </p>
                </div>
            `;
            return;
        }

        console.log('[DEBUG] Renderizando', reservas.length, 'reservas');
        let html = '<ul class="list-group list-group-flush">';

        reservas.forEach(r => {
            // Safe date handling with fallbacks
            let inicio = null;
            let fim = null;

            // Try different date field names that might come from the API
            if (r.horario_inicio_reserva) {
                inicio = new Date(r.horario_inicio_reserva);
            } else if (r.data_entrada_prevista) {
                inicio = new Date(r.data_entrada_prevista);
            }

            if (r.horario_fim_reserva) {
                fim = new Date(r.horario_fim_reserva);
            } else if (r.data_saida_prevista) {
                fim = new Date(r.data_saida_prevista);
            }

            // Format dates with fallbacks
            const formatDate = (date) => {
                if (!date || isNaN(date.getTime())) return '--/--/---- --:--';
                return date.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(',', '');
            };

            const formatTime = (date) => {
                if (!date || isNaN(date.getTime())) return '--:--';
                return date.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            };

            const iS = formatDate(inicio);
            const fS = formatTime(fim || inicio);

            // Safe status handling (single status column)
            const status = (r.status || 'desconhecido').toLowerCase();
            let sC = 'secondary';
            let sT = status.replace('_', ' ');

            // Set status color
            if (status === 'ativa' || status === 'confirmada') sC = 'success';
            else if (status === 'concluida' || status === 'concluída') sC = 'primary';
            else if (status === 'expirada' || status === 'nao_compareceu' || status === 'não_compareceu') sC = 'warning';
            else if (status === 'cancelada') sC = 'danger';

            // Action buttons for active reservations
            let actionButtons = '';
            if (showActions && r.id) {
                if (status === 'pendente') {
                    // Botão de pagamento para reservas pendentes
                    actionButtons = `
                        <div class="mt-2 d-flex justify-content-end">
                            <button class="btn btn-sm btn-warning me-2" onclick="handleEfetuarPagamento(${r.id}, event)">
                                <i class="fas fa-credit-card me-1"></i> Efetuar Pagamento
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="handleCancelarReserva(${r.id}, event)">
                                <i class="fas fa-times me-1"></i> Cancelar
                            </button>
                        </div>
                    `;
                } else if (status === 'ativa' || status === 'confirmada') {
                    // Botões de estender e cancelar para reservas ativas/confirmadas
                    actionButtons = `
                        <div class="mt-2 d-flex justify-content-end">
                            <button class="btn btn-sm btn-outline-primary me-2" onclick="handleEstenderReserva(${r.id}, event)">
                                <i class="fas fa-clock me-1"></i> Estender
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="handleCancelarReserva(${r.id}, event)">
                                <i class="fas fa-times me-1"></i> Cancelar
                            </button>
                        </div>
                    `;
                }
            }

            // Build the reservation item
            html += `
                <li class="list-group-item">
                    <div>
                        <h5>${escapeHtml(r.estacionamento_nome || r.nome_estacionamento || 'Estacionamento')} - Vaga ${escapeHtml(r.vaga_numero || r.numero_vaga || r.numero || 'N/A')}</h5>
                        <p class="mb-1"><i class="fas fa-map-marker-alt me-2 text-muted"></i> ${escapeHtml(r.estacionamento_endereco || r.endereco_estacionamento || 'Endereço não disponível')}</p>
                        <p class="mb-1"><i class="far fa-calendar-alt me-2 text-muted"></i> ${iS} - ${fS}</p>
                        <p class="mb-2"><i class="fas fa-car me-2 text-muted"></i> Placa: ${escapeHtml(r.placa_veiculo || 'Não informada')}</p>
                        <span class="badge ${sC}">${sT.toUpperCase()}</span>
                        ${actionButtons}
                    </div>
                </li>
            `;
        });

        html += '</ul>';
        container.innerHTML = html;
    }

    // Função para carregar as reservas ativas
    async function loadMinhasReservas() {
        console.log('[DEBUG] loadMinhasReservas() chamada');
        const activeContainer = document.getElementById('listaReservasAtivas');
        const historyContainer = document.getElementById('listaReservasHistorico');

        console.log('[DEBUG] Containers encontrados:', { activeContainer, historyContainer });

        if (!activeContainer || !historyContainer) {
            console.error('[DEBUG] Containers não encontrados!');
            return;
        }

        try {
            // Show loading state for active tab
            activeContainer.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            `;

            console.log('[DEBUG] Fazendo requisição para /api/reservas/minhas?status=pendente,ativa,confirmada');

            // Load active/confirmed/pending reservations
            const activeResponse = await fetchWithAuth('/api/reservas/minhas?status=pendente,ativa,confirmada');
            console.log('[DEBUG] Resposta recebida:', activeResponse);

            const activeReservas = activeResponse?.data || [];
            console.log('[DEBUG] Reservas ativas encontradas:', activeReservas.length, activeReservas);

            renderReservasList(activeReservas, 'listaReservasAtivas', true);

            // Update tab badge
            const activeBadge = document.querySelector('#ativas-tab .badge');
            if (activeBadge) {
                activeBadge.textContent = activeReservas.length || '';
                activeBadge.style.display = activeReservas.length ? 'inline-block' : 'none';
            }

            // If history tab is active, load historical reservations
            const activeTab = document.querySelector('#reservasTabs .nav-link.active');
            if (activeTab && activeTab.id === 'historico-tab') {
                await loadHistoricoReservas();
            }

        } catch (e) {
            console.error('Erro ao carregar reservas ativas:', e);
            activeContainer.innerHTML = `
                <div class="alert alert-danger m-3" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Ocorreu um erro ao carregar suas reservas ativas.
                    <div class="mt-2 small">${escapeHtml(e.message || 'Tente novamente mais tarde.')}</div>
                </div>
            `;
        }
    }

    // Função para carregar o histórico de reservas
    async function loadHistoricoReservas() {
        console.log('[DEBUG] loadHistoricoReservas() chamada');
        const container = document.getElementById('listaReservasHistorico');
        console.log('[DEBUG] Container histórico encontrado:', container);

        if (!container) {
            console.error('[DEBUG] Container histórico não encontrado!');
            return;
        }

        try {
            // Show loading state
            container.innerHTML = `
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            `;

            console.log('[DEBUG] Fazendo requisição para histórico...');

            // Load historical reservations (cancelled, completed, expired, etc.)
            const historyResponse = await fetchWithAuth('/api/reservas/minhas?status=cancelada,concluida,expirada,nao_compareceu');
            console.log('[DEBUG] Resposta do histórico:', historyResponse);

            const historyReservas = historyResponse?.data || [];
            console.log('[DEBUG] Reservas do histórico:', historyReservas.length, historyReservas);

            // Sort by date (newest first)
            historyReservas.sort((a, b) => {
                const dateA = new Date(a.horario_inicio_reserva || a.data_entrada_prevista || 0);
                const dateB = new Date(b.horario_inicio_reserva || b.data_entrada_prevista || 0);
                return dateB - dateA;
            });

            console.log('[DEBUG] Renderizando histórico...');
            renderReservasList(historyReservas, 'listaReservasHistorico', false);

            // Update tab badge
            const historyBadge = document.querySelector('#historico-tab .badge');
            if (historyBadge) {
                historyBadge.textContent = historyReservas.length || '';
                historyBadge.style.display = historyReservas.length ? 'inline-block' : 'none';
            }

        } catch (e) {
            console.error('[DEBUG] Erro ao carregar histórico de reservas:', e);
            container.innerHTML = `
                <div class="alert alert-danger m-3" role="alert">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Ocorreu um erro ao carregar o histórico de reservas.
                    <div class="mt-2 small">${escapeHtml(e.message || 'Tente novamente mais tarde.')}</div>
                </div>
            `;
        }
    }

    // Adiciona evento de clique para a aba de histórico
    $(document).ready(function() {
        console.log('[DEBUG] Registrando evento da aba histórico');

        // Evento quando a aba é mostrada
        $('#historico-tab').on('shown.bs.tab', function (e) {
            console.log('[DEBUG] Evento shown.bs.tab disparado!');
            loadHistoricoReservas();
        });

        // Evento de click como fallback
        $('#historico-tab').on('click', function(e) {
            console.log('[DEBUG] Click no histórico detectado!');
            setTimeout(function() {
                loadHistoricoReservas();
            }, 300);
        });
    });
    // Variável para armazenar os dados da reserva sendo estendida
let reservaAtualParaEstender = null;

// Função para abrir o modal de estender reserva
async function handleEstenderReserva(id, event) {
    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    try {
        // Buscar detalhes da reserva
        const reserva = await fetchWithAuth(`/api/reservas/${id}`);
        reservaAtualParaEstender = reserva;

        // Preencher informações no modal
        $('#estenderReservaEstacionamento').text(reserva.nome_estacionamento || 'Estacionamento');
        $('#estenderReservaVaga').html(`<strong>Vaga:</strong> ${reserva.numero_vaga || 'N/A'}`);

        // Usar data_entrada_prevista e data_saida_prevista que são os campos corretos
        const inicio = new Date(reserva.data_entrada_prevista);
        const fim = new Date(reserva.data_saida_prevista);

        const inicioStr = inicio.toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'});
        const fimStr = fim.toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'});

        $('#estenderReservaPeriodoAtual').html(`<strong>Período atual:</strong> ${inicioStr} até ${fimStr}`);
        $('#estenderReservaFimAtual').html(`<strong>Término atual:</strong> ${fimStr}`);

        // Resetar o dropdown de duração
        $('#estenderDuracao').val('60');

        // Calcular e mostrar o novo horário de término
        atualizarNovoHorarioTermino();

        // Configurar o evento de mudança para o dropdown de duração
        $('#estenderDuracao').off('change').on('change', atualizarNovoHorarioTermino);

        // Configurar o botão de confirmação
        $('#confirmarEstenderBtn').off('click').on('click', confirmarEstensaoReserva);

        // Limpar feedback anterior
        hideAlertModal('estender-reserva-feedback');

        // Mostrar o modal
        $('#estenderReservaModal').modal('show');
    } catch (e) {
        console.error('Erro ao buscar detalhes da reserva:', e);
        showUserAlert(`Erro ao carregar detalhes da reserva: ${e?.data?.message || e.message}`, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-clock"></i> Estender';
    }
}

// Função para atualizar o novo horário de término no modal
function atualizarNovoHorarioTermino() {
    if (!reservaAtualParaEstender) return;

    const duracaoAdicional = parseInt($('#estenderDuracao').val());
    // Usar data_saida_prevista que é o campo correto
    const fimAtual = new Date(reservaAtualParaEstender.data_saida_prevista);
    const novoFim = new Date(fimAtual.getTime() + duracaoAdicional * 60000);

    $('#estenderReservaNovoFim').text(novoFim.toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}));
}

// Função para confirmar a extensão da reserva
async function confirmarEstensaoReserva() {
    if (!reservaAtualParaEstender) {
        showAlertModal('estender-reserva-feedback', 'Dados da reserva não encontrados.', 'danger');
        return;
    }

    const btn = document.getElementById('confirmarEstenderBtn');
    showLoadingModal('estenderReservaModal', true, '#confirmarEstenderBtn');
    hideAlertModal('estender-reserva-feedback');

    try {
        const duracaoAdicional = parseInt($('#estenderDuracao').val());

        // Enviar solicitação para estender a reserva
        const result = await fetchWithAuth(`/api/reservas/${reservaAtualParaEstender.id}/estender`, {
            method: 'PUT',
            body: JSON.stringify({
                duracao_adicional_minutos: duracaoAdicional
            })
        });

        showAlertModal('estender-reserva-feedback', result.message || 'Reserva estendida com sucesso!', 'success');

        // Fechar o modal após alguns segundos e recarregar as reservas
        setTimeout(() => {
            $('#estenderReservaModal').modal('hide');
            loadMinhasReservas();
        }, 1500);
    } catch (e) {
        console.error('Erro ao estender reserva:', e);
        showAlertModal('estender-reserva-feedback', `Erro: ${e?.data?.message || e.message}`, 'danger');
    } finally {
        showLoadingModal('estenderReservaModal', false, '#confirmarEstenderBtn');
    }
}

// Função para abrir o modal de pagamento PIX para uma reserva pendente
async function handleEfetuarPagamento(reservaId, event) {
    const btn = event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    try {
        // PIX manual (always free): busca o PIX já gerado da reserva e abre o modal.
        const pixResp = await fetchWithAuth(`/api/reservas/${reservaId}/pix`);
        if (!pixResp.success || !pixResp.data) {
            throw new Error('PIX não encontrado para esta reserva.');
        }
        const data = pixResp.data;
        const pixData = preparePixModalData(reservaId, {
            qr_code_base64: data.qr_code_base64,
            qr_code_text: data.qr_code_text || data.qr_code,
            pagamento_id: data.pagamento_id,
            valor: data.valor,
            chave_pix: data.chave_pix,
            nome_titular: data.nome_titular,
            expira_em: data.expira_em,
        });
        showPixPaymentModal(pixData);
        return;
    } catch (e) {
        console.error('Erro:', e);
        showUserAlert('Erro ao gerar pagamento PIX. Tente novamente.', 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-credit-card me-1"></i> Efetuar Pagamento';
    }
}

async function handleCancelarReserva(id, event) {
    const btn=event.target.closest('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';

    if(!confirm("Tem certeza que deseja cancelar esta reserva?")){
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
        return;
    }

    try{
        const r=await fetchWithAuth(`/api/reservas/${id}/cancelar`,{method:'DELETE'});
        showUserAlert(r.message||'Reserva cancelada com sucesso.','success');
        loadMinhasReservas();
    } catch(e){
        showUserAlert(`Erro ao cancelar reserva: ${e?.data?.message||e.message}`,'danger');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
    }
}

// Função para limpar todo o histórico de reservas
async function limparHistoricoCompleto() {
    if (!confirm("Tem certeza que deseja limpar todo o histórico? Esta ação não pode ser desfeita.")) {
        return;
    }

    try {
        const result = await fetchWithAuth('/api/reservas/historico/limpar', {
            method: 'DELETE'
        });

        showUserAlert(result.message || 'Histórico limpo com sucesso!', 'success');

        // Recarregar o histórico
        await loadHistoricoReservas();

    } catch (e) {
        console.error('Erro ao limpar histórico:', e);
        showUserAlert(`Erro ao limpar histórico: ${e?.data?.message || e.message}`, 'danger');
    }
}
    if(reservasLink)reservasLink.addEventListener('click',(e)=>{e.preventDefault();showReservasSection();}); if(voltarMapaBtn)voltarMapaBtn.addEventListener('click',(e)=>{e.preventDefault();showMapaSection();});

    // Perfil Usuário ---

    // --- Funções de Reserva ---

    // Função auxiliar para formatar data/hora
    function formatDateTime(date) {
      if (!(date instanceof Date)) {
        date = new Date(date);
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    // --- Perfil Usuário ---
    async function loadUserProfile(){
        hideAlertModal('user-profile-feedback');
        try{
            const d = await fetchWithAuth('/api/user/profile');
            userData = d;
            $('#userName').val(d.nome||'');
            $('#userEmail').val(d.email||'');
            $('#userPhone').val(formatPhoneOnLoad(d.telefone||''));
            // Handle vehicle type with case insensitivity for backward compatibility
            if (d.tipo_veiculo) {
                const tipoVeiculoLower = d.tipo_veiculo.toLowerCase();
                // Temporarily enable the select to ensure it accepts the value
                const $tipoVeiculo = $('#userTipoVeiculo');
                $tipoVeiculo.prop('disabled', false);

                // Set value based on standardized types
                if (tipoVeiculoLower.includes('carro') || tipoVeiculoLower === 'car') {
                    $tipoVeiculo.val('carro');
                } else if (tipoVeiculoLower.includes('moto')) {
                    $tipoVeiculo.val('moto');
                } else if (tipoVeiculoLower.includes('van') || tipoVeiculoLower.includes('caminhonete')) {
                    $tipoVeiculo.val('van');
                } else if (tipoVeiculoLower.includes('caminhao') || tipoVeiculoLower.includes('caminh') || tipoVeiculoLower.includes('truck')) {
                    $tipoVeiculo.val('caminhao');
                } else {
                    // If no match, default to carro
                    $tipoVeiculo.val('carro');
                }

                // Restore the disabled state for view mode
                $tipoVeiculo.prop('disabled', true);
            } else {
                $('#userTipoVeiculo').val('');
            }
            $('#userPlaca').val(d.placa_veiculo||'');
            $('#userCpf').val(formatCpfOnLoad(d.cpf||''));

            // Atualizar a imagem de perfil se existir (carregada via endpoint
            // autenticado — fotos de perfil não são servidas estaticamente)
            if (d.foto_perfil) {
                loadProfileImage();
            } else {
                $('#userProfileImage').attr('src', '/user/img/user.png');
                $('.sidebar-header img').attr('src', '/user/img/user.png');
            }

            // Atualizar displays
            $('#userNameDisplay').text(d.nome || 'Usuário');
            $('#userEmailDisplay').text(d.email || '');

            // Atualizar a visibilidade dos botões de gerenciamento da foto
            updateProfileImageButtonsVisibility();

            resetUserFormState();
        } catch(e) {
            showUserAlert('Falha ao carregar perfil.','danger');
            $('#userModal').modal('hide');
        }
    }
    function resetUserFormState(){
      // Redefinir todos os inputs para readonly e remover mensagens de erro
      $('#userForm input').prop('readonly',true).removeClass('is-invalid');

      // Desabilitar o select de tipo de veículo
      $('#userTipoVeiculo').prop('readonly',true).prop('disabled',true);

      // Ocultar mensagens de erro
      $('.invalid-feedback').hide();

      // Mostrar/esconder botões apropriados
      $('#saveUserBtn, #cancelEditBtn').hide();
      $('#editUserBtn').show();
      $('#closeUserBtn').prop('disabled',false);
    }
    function enableUserFormEdit(){
      if(userData){ /* Exemplo: pré-popular campos se necessário, mas já feito no load */ }
      $('#userForm input').prop('readonly',false);
      $('#userEmail').prop('readonly',true); /* Email geralmente não é editável */

      // Habilitar o select de tipo de veículo removendo readonly e disabled
      $('#userTipoVeiculo').prop('readonly',false).prop('disabled',false);

      // Exibir botões de salvar e cancelar
      $('#saveUserBtn, #cancelEditBtn').show();
      $('#editUserBtn').hide();
      $('#closeUserBtn').prop('disabled',true);
    }
    function cancelUserFormEdit(){ if(userData){ loadUserProfile(); /* Recarrega dados originais */ } resetUserFormState(); }
    async function saveUserProfile(){
        const btn=document.getElementById('saveUserBtn');
        showLoadingModal('userModal',true,'#saveUserBtn');
        hideAlertModal('user-profile-feedback');

        if(!validateUserForm()){
            showLoadingModal('userModal',false,'#saveUserBtn');
            showAlertModal('user-profile-feedback','Corrija os campos inválidos.','warning');
            return;
        }

        const formData = {
            nome: $('#userName').val(),
            telefone: $('#userPhone').val().replace(/\D/g,''),
            tipo_veiculo: $('#userTipoVeiculo').val(),
            placa_veiculo: $('#userPlaca').val().toUpperCase(),
            cpf: $('#userCpf').val().replace(/\D/g,'') || null,
            foto_perfil: userData?.foto_perfil || null // Manter a foto atual
        };

        try{
            const r = await fetchWithAuth('/api/user/profile',{method:'PUT',body:JSON.stringify(formData)});
            if(r?.user){
                showAlertModal('user-profile-feedback',r.message || 'Perfil atualizado com sucesso!','success');
                userData = r.user;
                resetUserFormState();
                setTimeout(()=>hideAlertModal('user-profile-feedback'),3000);
            } else {
                throw new Error(r?.message||'Falha ao salvar o perfil.');
            }
        } catch(e){
            showAlertModal('user-profile-feedback',`Erro: ${e?.data?.message||e.message}`,'danger');
        } finally{
            showLoadingModal('userModal',false,'#saveUserBtn');
        }
    }
    function validateUserForm(){ let isValid=true; const form=document.getElementById('userForm'); form.querySelectorAll('input[required]').forEach(input => clearErrorFor(input)); const userName=document.getElementById('userName'); if(!userName.value.trim()) isValid = setErrorFor(userName,'Nome é obrigatório.'); const userPhone=document.getElementById('userPhone'); const phoneDigits = userPhone.value.replace(/\D/g,''); if(!userPhone.value.trim() || phoneDigits.length < 10 || phoneDigits.length > 11) isValid = setErrorFor(userPhone,'Telefone inválido (ex: (XX) XXXXX-XXXX).'); const userTipoVeiculo=document.getElementById('userTipoVeiculo'); if(!userTipoVeiculo.value.trim()) isValid = setErrorFor(userTipoVeiculo,'Tipo de veículo é obrigatório.'); const userPlaca=document.getElementById('userPlaca'); const placaValue = userPlaca.value.toUpperCase(); if(!userPlaca.value.trim() || !(/^[A-Z]{3}\d{4}$/.test(placaValue) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(placaValue))) isValid = setErrorFor(userPlaca,'Placa inválida (AAA0000 ou AAA0A00).'); const userCpf=document.getElementById('userCpf'); if(userCpf.value.trim() && !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(userCpf.value)) isValid = setErrorFor(userCpf,'CPF inválido (000.000.000-00).'); return isValid; }
    function formatPhoneOnLoad(v){if(!v)return'';const d=v.replace(/\D/g,'');if(d.length===11)return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return v} function formatCpfOnLoad(v){if(!v)return'';const d=v.replace(/\D/g,'');if(d.length===11)return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;return v} function formatPhoneMask(v){if(!v)return v;const d=v.replace(/\D/g,'').slice(0,11);const l=d.length;if(l<=2)return`(${d}`;if(l<=6)return`(${d.slice(0,2)}) ${d.slice(2)}`;if(l<=10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`} function formatCpfMask(v){if(!v)return v;const d=v.replace(/\D/g,'').slice(0,11);const l=d.length;if(l<=3)return d;if(l<=6)return`${d.slice(0,3)}.${d.slice(3)}`;if(l<=9)return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`}

    // Funções do Sistema de Notificações
    function updateNotificationBadge() {
        // Busca as notificações do localStorage
        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

        // Conta notificações não lidas
        const unreadCount = notifications.filter(notification => !notification.read).length;

        // Atualiza o contador na interface, se existir
        const countElement = document.querySelector('#notificationCount');
        if (countElement) {
            countElement.textContent = unreadCount > 0 ? unreadCount : '';
            countElement.style.display = unreadCount > 0 ? 'block' : 'none';
        }

        return unreadCount;
    }

    function addNotificationIconToSidebar() {
        // Localiza a lista de navegação na sidebar
        const navList = document.querySelector('.sidebar nav ul');
        if (!navList) return;

        // Cria o item de notificações
        const notificationItem = document.createElement('li');
        notificationItem.innerHTML = `
            <a href="#" id="notificationIcon" class="position-relative">
                <i class="fas fa-bell"></i>
                <span>Notificações</span>
                <span id="notificationCount" class="badge badge-danger badge-pill position-absolute" style="top: 5px; right: 5px; display: none;"></span>
            </a>
        `;

        // Adiciona à lista de navegação
        navList.appendChild(notificationItem);

        // Adiciona evento de clique
        document.getElementById('notificationIcon').addEventListener('click', function(e) {
            e.preventDefault();
            showNotificationsPanel();
        });

        // Atualiza o contador
        updateNotificationBadge();
    }

    function showNotificationsPanel() {
        // Busca as notificações do localStorage
        const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');

        // Remove modal anterior se existir
        const existingModal = document.getElementById('notificationsModal');
        if (existingModal) {
            $(existingModal).modal('hide');
            existingModal.parentElement.remove();
        }

        // Cria o modal de notificações
        const modalHtml = `
        <div class="modal fade" id="notificationsModal" tabindex="-1" role="dialog" aria-labelledby="notificationsModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="notificationsModalLabel">
                            <i class="fas fa-bell mr-2"></i>Notificações
                        </h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Fechar">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="notifications-actions mb-3">
                            <button id="markAllReadBtn" class="btn btn-sm btn-outline-primary">
                                <i class="fas fa-check-double mr-1"></i>Marcar todas como lidas
                            </button>
                        </div>
                        <div class="notifications-list">
                            ${notifications.length > 0 ? generateNotificationsList(notifications) : '<p class="text-center text-muted py-4">Nenhuma notificação recente.</p>'}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
        `;

        // Adiciona o modal ao corpo da página
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // Inicializa o modal
        const modalElement = document.getElementById('notificationsModal');
        $(modalElement).modal('show');

        // Adiciona evento para marcar todas como lidas
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', function() {
                if (typeof notificationService !== 'undefined' && notificationService.markAllAsRead) {
                    notificationService.markAllAsRead();
                } else {
                    // Fallback: marcar manualmente
                    const allNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
                    allNotifications.forEach(n => n.read = true);
                    localStorage.setItem('notifications', JSON.stringify(allNotifications));
                }
                updateNotificationBadge();
                const notificationsList = document.querySelector('.notifications-list');
                if (notificationsList) {
                    notificationsList.innerHTML = generateNotificationsList(JSON.parse(localStorage.getItem('notifications') || '[]'));
                }
            });
        }

        // Adiciona eventos para marcar individual como lida
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const notificationId = this.dataset.id;
                if (typeof notificationService !== 'undefined' && notificationService.markAsRead) {
                    notificationService.markAsRead(notificationId);
                } else {
                    // Fallback: marcar manualmente
                    const allNotifications = JSON.parse(localStorage.getItem('notifications') || '[]');
                    const notification = allNotifications.find(n => n.id == notificationId);
                    if (notification) notification.read = true;
                    localStorage.setItem('notifications', JSON.stringify(allNotifications));
                }
                updateNotificationBadge();
                this.closest('.notification-item').classList.add('read');
                this.closest('.notification-item').classList.remove('unread');
                this.style.display = 'none';
            });
        });

        // Remove o modal quando fechado
        $(modalElement).on('hidden.bs.modal', function () {
            modalContainer.remove();
        });
    }

    function generateNotificationsList(notifications) {
        if (!notifications || notifications.length === 0) {
            return '<p class="text-center text-muted">Nenhuma notificação recente.</p>';
        }

        let html = '';

        notifications.forEach(notification => {
            const date = new Date(notification.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

            html += `
            <div class="notification-item ${notification.read ? 'read' : 'unread'} mb-3 p-3 border-left">
                <div class="d-flex justify-content-between align-items-start">
                    <h6 class="notification-title mb-1">${notification.title}</h6>
                    <small class="text-muted">${formattedDate}</small>
                </div>
                <p class="notification-message mb-2">${notification.message}</p>
                <div class="notification-actions text-right">
                    ${!notification.read ? `<button class="btn btn-sm btn-link mark-read-btn" data-id="${notification.id}">Marcar como lida</button>` : ''}
                </div>
            </div>
            `;
        });

        return html;
    }

    // Função para mostrar alertas na interface
    function showAlert(message, type = 'info', duration = 5000) {
        const id = `alert-${Date.now()}`;
        const alertHtml = `
            <div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        `;

        $('#mainAlertBox').append(alertHtml);

        if (duration > 0) {
            setTimeout(() => {
                $(`#${id}`).alert('close');
            }, duration);
        }
    }

    // Função para lidar com o upload da imagem de perfil
    function handleProfileImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Verificar se o arquivo é uma imagem
        if (!file.type.match('image.*')) {
            showUserAlert('Por favor, selecione uma imagem válida.', 'warning');
            return;
        }

        // Verificar o tamanho do arquivo (máximo 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showUserAlert('A imagem deve ter no máximo 2MB.', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                // Exibir a imagem no modal
                $('#userProfileImage').attr('src', e.target.result);

                // Atualizar o ícone na barra lateral
                $('.sidebar-header img').attr('src', e.target.result);

                // Salvar a imagem no servidor
                const formData = new FormData();
                formData.append('profileImage', file);

                showUserAlert('Enviando imagem...', 'info');

                // Enviar a imagem para o servidor
                const response = await fetchWithAuth('/api/user/profile/image', {
                    method: 'POST',
                    body: formData
                });

                if (response?.imageUrl) {
                    // Atualizar a URL da imagem nos dados do usuário
                    userData.foto_perfil = response.imageUrl;
                    showUserAlert('Imagem de perfil atualizada com sucesso!', 'success');

                    // Recarrega a foto a partir do endpoint autenticado
                    loadProfileImage();

                    // Atualizar a visibilidade dos botões de gerenciamento
                    updateProfileImageButtonsVisibility();
                } else {
                    throw new Error('Falha ao enviar a imagem.');
                }
            } catch (error) {
                console.error('Erro ao enviar imagem:', error);
                showUserAlert(`Erro ao enviar imagem: ${error.message}`, 'danger');

                // Reverter para a imagem anterior ou padrão
                if (userData?.foto_perfil) {
                    loadProfileImage();
                } else {
                    $('#userProfileImage').attr('src', '/user/img/user.png');
                    $('.sidebar-header img').attr('src', '/user/img/user.png');
                }
            }
        };
        reader.readAsDataURL(file);
    }

    // Função para remover a foto de perfil
    async function removeProfileImage() {
        // Confirmar a remoção da foto
        if (!confirm('Tem certeza que deseja remover sua foto de perfil?')) {
            return;
        }

        try {
            showUserAlert('Removendo foto de perfil...', 'info');

            // Chamar a API para remover a foto
            const response = await fetchWithAuth('/api/user/profile/image', {
                method: 'DELETE'
            });

            if (response?.success) {
                // Atualizar a interface
                $('#userProfileImage').attr('src', '/user/img/user.png');
                $('.sidebar-header img').attr('src', '/user/img/user.png');

                // Atualizar os dados do usuário
                userData.foto_perfil = null;

                showUserAlert('Foto de perfil removida com sucesso!', 'success');

                // Atualizar a visibilidade dos botões de gerenciamento
                updateProfileImageButtonsVisibility();
            } else {
                throw new Error(response?.message || 'Falha ao remover a foto de perfil.');
            }
        } catch (error) {
            console.error('Erro ao remover foto de perfil:', error);
            showUserAlert(`Erro ao remover foto: ${error.message}`, 'danger');
        }
    }

    // Carrega a foto de perfil pelo endpoint autenticado e aplica via blob URL.
    // Necessário porque fotos de perfil não são servidas estaticamente (PII):
    // <img src> puro não envia o header Authorization.
    let profileImageObjectUrl = null;
    async function loadProfileImage() {
        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;
            const resp = await fetch('/api/user/profile/foto', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            if (profileImageObjectUrl) URL.revokeObjectURL(profileImageObjectUrl);
            profileImageObjectUrl = URL.createObjectURL(blob);
            $('#userProfileImage').attr('src', profileImageObjectUrl);
            $('.sidebar-header img').attr('src', profileImageObjectUrl);
        } catch (e) {
            $('#userProfileImage').attr('src', '/user/img/user.png');
            $('.sidebar-header img').attr('src', '/user/img/user.png');
        }
    }

    // Função para atualizar a visibilidade dos botões de gerenciamento da foto
    function updateProfileImageButtonsVisibility() {
        // Se o usuário tem foto de perfil, mostrar o botão de remover
        if (userData?.foto_perfil) {
            $('#removeProfileImageBtn').show();
        } else {
            $('#removeProfileImageBtn').hide();
        }
    }

    // --- Inicialização ---
    document.addEventListener('DOMContentLoaded', async function() {
        // Inicializa gerenciamento de seções
        if (typeof initSectionManagement === 'function') {
            initSectionManagement();
        }

        try {
            if (await checkAndRefreshToken()) {
                initMap();
                getUserLocation(false); // Tenta obter a localização do usuário ao iniciar, sem centralizar imediatamente.

                try {
                    await loadEstacionamentos();
                } catch (error) {
                    console.error("Erro ao carregar estacionamentos na inicialização:", error);
                    showUserAlert("Não foi possível carregar os estacionamentos. Verifique sua conexão.", "warning");
                }

                // Carregar informações do usuário para inicializar a interface
                try {
                    const userData = await fetchWithAuth('/api/user/profile');
                    if (userData) {
                        // Inicializar a visibilidade dos botões de gerenciamento da foto
                        updateProfileImageButtonsVisibility();
                    }
                } catch (error) {
                    console.error("Erro ao carregar perfil do usuário na inicialização:", error);
                }

                // Conectar ao Socket.IO para notificações em tempo real
                if (config?.realtime?.enabled ?? true) {
                    // Inicializar o serviço de notificações
                    const userId = localStorage.getItem('userId');
                    const token = localStorage.getItem('authToken');

                    // Inicializa o serviço com as configurações
                    notificationService.init({
                        userId: userId,
                        token: token,
                        soundEnabled: true,
                        containerSelector: '#notificationContainer'
                    });

                    // Registra listeners para eventos de notificação
                    notificationService.on('notification', (data) => {
                        console.log('Nova notificação recebida:', data);
                        // Atualiza o contador de notificações
                        updateNotificationBadge();
                    });

                    notificationService.on('connect', (data) => {
                        console.log('Conectado ao serviço de notificações:', data);
                    });

                    notificationService.on('disconnect', (data) => {
                        console.log('Desconectado do serviço de notificações:', data);
                    });

                    // Atualiza o contador de notificações não lidas
                    updateNotificationBadge();

                    // Adicionar ícone de notificações na sidebar se ainda não existir
                    if (!document.querySelector('#notificationIcon')) {
                        addNotificationIconToSidebar();
                    }
                }

                $('#userIconTrigger').on('click', loadUserProfile);
                $('#editUserBtn').on('click', enableUserFormEdit);
                $('#cancelEditBtn').on('click', cancelUserFormEdit);
                $('#saveUserBtn').on('click', saveUserProfile);
                $('#userPhone').on('input', (e) => e.target.value = formatPhoneMask(e.target.value));
                $('#userCpf').on('input', (e) => e.target.value = formatCpfMask(e.target.value));

                // Eventos para o upload de imagem de perfil
                $('#profileImageInput').on('change', handleProfileImageUpload);

                // Botão para alterar a foto de perfil (apenas este botão pode iniciar o upload)
                $('#changeProfileImageBtn').on('click', function() {
                    $('#profileImageInput').click();
                });

                // Botão para remover a foto de perfil
                $('#removeProfileImageBtn').on('click', removeProfileImage);

                const logoutBtn = document.getElementById('logoutLink');
                if (logoutBtn) {
                    logoutBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        logoutUser();
                    });
                }

                window.addEventListener('beforeunload', disconnectHomeSocketIO);
            }
        } catch (error) {
            console.error("Erro crítico na inicialização da página:", error);
            showUserAlert("Ocorreu um erro grave ao carregar a aplicação. Por favor, recarregue a página.", "danger");
        }
    });

    // Função para verificar e atualizar o token se necessário
    async function checkAndRefreshToken() {
        let token = localStorage.getItem('authToken');
        if (!token) {
            // Tentar obter um novo token com refresh token
            token = await attemptTokenRefresh();
            if (!token) {
                // Se não conseguir um novo token, redirecionar para login
                window.location.href = '/index.html';
                return false;
            }
        }
        return true;
    }

    // Função para tentar atualizar o token usando o refresh token
    async function attemptTokenRefresh() {
        try {
            // Fazer uma requisição para o endpoint de refresh token
            const response = await fetch('/api/auth/refresh-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // Importante para enviar cookies
            });

            if (!response.ok) {
                throw new Error('Falha ao atualizar o token');
            }

            const data = await response.json();
            if (data && data.accessToken) {
                // Salvar o novo token no localStorage
                localStorage.setItem('authToken', data.accessToken);
                console.log('Token atualizado com sucesso');
                return data.accessToken;
            } else {
                throw new Error('Token não recebido do servidor');
            }
        } catch (error) {
            console.error('Erro ao atualizar token:', error);
            return null;
        }
    }

    async function fetchWithAuth(url, options = {}, isRetry = false) {
        let t = localStorage.getItem('authToken');

        if (!t && !url.includes('/refresh-token')) { // Corrigido para /refresh-token
            t = await attemptTokenRefresh();
            if (!t) {
                if (!isRetry) {
                    console.warn("Token não encontrado e refresh falhou. Redirecionando para login.");
                    logoutUser(); // Chama logoutUser para limpar tudo e redirecionar
                }
                return Promise.reject(new Error("Token de autenticação ausente.")); // Rejeita a promessa
            }
        }

        const h = {'Authorization':`Bearer ${t}`,'Content-Type':'application/json', ...options.headers};
        if(options.body instanceof FormData) delete h['Content-Type'];

        try {
            const r = await fetch(url, {...options, headers:h});
            if(r.status===401 && !isRetry && !url.includes('/logout') && !url.includes('/refresh-token')) { // Corrigido para /refresh-token
                const nT = await attemptTokenRefresh();
                if(nT) return fetchWithAuth(url, {...options, headers:{...h,'Authorization':`Bearer ${nT}`}}, true);
                else {
                    await logoutUser(true); // Força logout e redirecionamento
                    throw new Error("Sessão expirada. Faça login novamente."); // Lança erro para interromper
                }
            }

            // Tratamento para respostas sem conteúdo JSON (ex: 204 No Content)
            if (r.status === 204) {
                 if(!r.ok && r.status !== 204) { // Adicionado para tratar erros mesmo com 204, se não for ok
                    const e=new Error(`Erro HTTP ${r.status}`);
                    e.data={message: `Erro ${r.status} ao processar a requisição.`};
                    throw e;
                 }
                return null;
            }

            const d = await r.json();
            if(!r.ok) {
                const e=new Error(d.message||`Erro ${r.status} na requisição para ${url}`);
                e.data=d;
                e.status = r.status;
                throw e;
            }
            return d;

        } catch(e) {
            // Se o erro já tem 'data', é um erro da API que já foi tratado.
            // Se não, pode ser um erro de rede ou JSON parse.
            if (!e.data) {
                 console.error(`Erro na comunicação com ${url}:`, e.message);
                 e.data = { message: e.message || "Erro de comunicação com o servidor."};
            } else {
                console.error(`Erro API em ${url} (Status ${e.status || 'N/A'}):`, e.data.message || e.message);
            }
            throw e; // Re-lança o erro para ser tratado por quem chamou fetchWithAuth
        }
    }

    async function logoutUser(redir=true) {
        disconnectHomeSocketIO();
        const token = localStorage.getItem('authToken');
        if (token) { // Só tenta logout na API se houver token
            try {
                await fetchWithAuth('/api/auth/logout', {method:'POST'});
            } catch(e) {
                console.warn("Aviso durante o logout da API:", e.message);
            }
        }
        localStorage.removeItem('authToken');
        if(redir) window.location.href='/index.html';
    }
