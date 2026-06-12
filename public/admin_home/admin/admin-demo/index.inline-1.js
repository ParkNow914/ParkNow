// Extraído de public/admin_home/admin/admin-demo/index.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Escapa valores dinamicos interpolados em templates HTML (anti-XSS)
        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }

        // ***** SCRIPT FINAL (ADMIN UI MELHORADA + FEEDBACK + SOCKET.IO + CRUDs) *****
        const API_BASE_URL = '/api/admin'; const VAGAS_POR_PAGINA = 30; let todasAsVagas = [], paginaAtual = 1; const ESTACIONAMENTO_ID_PADRAO = 1;
        let todosEstacionamentos = []; let todosUsuarios = [];
        let adminSocket = null; let reconnectAttempt = 0; const MAX_RECONNECT_ATTEMPTS = 5;
        // Assumindo config global para habilitar/desabilitar socket
        let config = { realtime: { enabled: true } };

        // --- Feedback & Loading ---
        const showAdminLoading = (btn, loading, txt='Salvar') => { if(!btn)return; btn.disabled=loading; const s=btn.querySelector('.spinner-border'); const i=btn.querySelector('i'); if(loading){if(i)i.style.display='none'; if(s)s.style.display='inline-block'; let tN=Array.from(btn.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim().length>0); if(tN)tN.nodeValue=' Processando...'; else btn.insertAdjacentText('beforeend',' Processando...');} else {if(i)i.style.display=''; if(s)s.style.display='none'; let lTN=Array.from(btn.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.includes('Processando')); if(lTN)btn.removeChild(lTN); let cT=Array.from(btn.childNodes).find(n=>n.nodeType===Node.TEXT_NODE)?.nodeValue?.trim(); if(!cT)btn.insertAdjacentText(i?'beforeend':'afterbegin',` ${txt}`);}};
        const showAdminAlert = (msg, type='danger', elId='adminGeneralAlert') => { const fb=document.getElementById(elId); if(fb){fb.innerHTML=`<div class="alert alert-${type} alert-dismissible fade show m-0" role="alert" style="font-size: 0.9rem; padding: .6rem 1rem;">${escapeHtml(msg)}<button type="button" class="close" data-dismiss="alert" style="padding: .6rem 1rem;">×</button></div>`; fb.style.display='block';}else{console.warn(`Alert #${elId} N/A`); alert(`[${type.toUpperCase()}] ${msg}`);}};
        const hideAdminAlert = (elId='adminGeneralAlert') => { const c=document.getElementById(elId); if(c) c.style.display = 'none';};

        // --- Auth e API Admin (com refresh via cookie) ---
        function getAdminToken() { const t = localStorage.getItem('adminAuthToken'); if (!t) window.location.href = '/admin_home/admin-home.html'; return t; }
        async function fetchAdminAPI(endpoint, options = {}, isRetry = false) { 
            let t = localStorage.getItem('adminAuthToken'); 
            if (!t && !endpoint.includes('/refresh')) { 
                try {
                    // Tenta fazer refresh do token antes de redirecionar
                    const newToken = await attemptAdminTokenRefresh();
                    if (newToken) {
                        t = newToken;
                    } else {
                        window.location.href='/admin_home/admin-home.html'; 
                        return Promise.reject("Sem token válido. Redirecionando...");
                    }
                } catch (error) {
                    console.error("Falha ao renovar token:", error);
                    window.location.href='/admin_home/admin-home.html'; 
                    return Promise.reject("Sem token válido. Redirecionando...");
                }
            } 
            
            const h = {
                'Authorization': `Bearer ${t}`,
                'Content-Type': 'application/json', 
                ...options.headers
            }; 
            
            if (options.body instanceof FormData) {
                delete h['Content-Type']; // Remove Content-Type para FormData
            }
            
            try { 
                console.log(`Fazendo requisição para: ${API_BASE_URL}${endpoint}`, options.method || 'GET');
                const r = await fetch(`${API_BASE_URL}${endpoint}`, {
                    ...options, 
                    headers: h
                }); 
                
                if (r.status === 401 && !isRetry && !endpoint.includes('/logout') && !endpoint.includes('/refresh')) {
                    console.log("Token expirado, tentando refresh...");
                    const nT = await attemptAdminTokenRefresh(); 
                    if (nT) {
                        console.log("Token renovado com sucesso");
                        return fetchAdminAPI(endpoint, {
                            ...options, 
                            headers: {
                                ...h,
                                'Authorization': `Bearer ${nT}`
                            }
                        }, true); 
                    } else { 
                        console.error("Falha ao renovar token após 401");
                        await logoutAdmin(false); 
                        throw new Error("Sessão admin expirada."); 
                    }
                } 
                
                try { 
                    // Para respostas não-JSON (204 No Content por exemplo)
                    if (r.status === 204) return null;
                    
                    const contentType = r.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        const d = await r.json(); 
                        if (!r.ok) {
                            const e = new Error(d.message || `Erro ${r.status}`); 
                            e.data = d; 
                            if (r.status === 422) e.validationErrors = d.errors; 
                            throw e;
                        } 
                        return d;
                    } else {
                        // Resposta não é JSON
                        if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
                        return r;
                    }
                } catch (jErr) {
                    console.error("Erro ao processar resposta:", jErr);
                    if (!r.ok) throw new Error(`Erro HTTP: ${r.status}`);
                    return r;
                }
            } catch (e) {
                console.error(`Erro na API Admin ${endpoint}:`, e?.data?.message || e.message, e.validationErrors || ''); 
                throw e;
            }
        }
        
        async function attemptAdminTokenRefresh() { 
            try { 
                console.log("Tentando renovar token admin...");
                const r = await fetch('/api/auth/admin/refresh-token', {
                    method: 'POST',
                    credentials: 'include', // Importante para enviar cookies
                    headers: {'Content-Type': 'application/json'}
                }); 
                
                if (!r.ok) {
                    console.error("Erro na resposta de refresh:", r.status);
                    return null;
                }
                
                const d = await r.json(); 
                if (!d.accessToken) {
                    console.error("Token não retornado no refresh");
                    return null;
                }
                
                console.log("Token admin renovado com sucesso");
                localStorage.setItem('adminAuthToken', d.accessToken); 
                return d.accessToken; 
            } catch (e) {
                console.error("Erro ao renovar token admin:", e.message); 
                return null;
            } 
        }
        
        async function logoutAdmin(redir=true) {
            disconnectAdminSocketIO();
            try {
                // Tenta fazer logout na API
                await fetch('/api/auth/admin/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminAuthToken')}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include' // Para enviar cookies
                });
            } catch(e) {
                console.warn("Aviso: Falha no logout admin na API:", e.message);
            } finally {
                // Limpa token local e redireciona independente da resposta da API
                localStorage.removeItem('adminAuthToken');
                if(redir) window.location.href='/admin_home/admin-home.html';
            }
        }

        // --- Socket.IO Client (Admin) ---
        function connectAdminSocketIO() { const token=localStorage.getItem('adminAuthToken'); if(!token || !config.realtime.enabled) return; if(adminSocket?.connected) return; if(adminSocket) adminSocket.disconnect(); console.log('[Socket.IO Admin] Conectando...'); adminSocket=io({auth:{token},reconnectionAttempts:5}); adminSocket.on('connect',()=>{console.log(`[Socket.IO Admin] Conectado: ${adminSocket.id}`); reconnectAttempt=0; adminSocket.emit('join_estacionamento', ESTACIONAMENTO_ID_PADRAO); adminSocket.emit('join_admin_room');}); adminSocket.on('disconnect',(r)=>console.warn(`[Socket.IO Admin] Desconectado: ${r}`)); adminSocket.on('connect_error',(err)=>{console.error(`[Socket.IO Admin] Erro: ${err.message}`); if(err.message.includes("Auth")||reconnectAttempt>=MAX_RECONNECT_ATTEMPTS)logoutAdmin(); else reconnectAttempt++;}); adminSocket.on('vaga_update',(vData)=>{console.log('[Socket.IO Admin] Rx vaga_update:',vData); const idx=todasAsVagas.findIndex(v=>v.id===vData.id); if(idx>-1)todasAsVagas[idx]={...todasAsVagas[idx],...vData}; else todasAsVagas.push(vData); exibirVagas(); loadVagasOcupadasAdmin();}); adminSocket.on('vagas_livres_update',(data)=>{console.log('[Socket.IO Admin] Rx vagas_livres_update:',data);}); adminSocket.on('nova_reserva',(rData)=>{console.log('[Socket.IO Admin] Rx nova_reserva:',rData); showAdminAlert(`Nova reserva: Vaga ${rData.numero_vaga} Est. ${rData.nome_estacionamento}!`,'info');}); }
        function disconnectAdminSocketIO() { if (adminSocket) { adminSocket.disconnect(); adminSocket = null; console.log('[Socket.IO Admin] Desconectado.'); } }

        // --- UI Vagas ---
        function exibirVagas() {
            // Use the same rendering logic as renderizarVagas
            renderizarVagas(todasAsVagas);
        }
        function atualizarTimerDisplay(el,s){ if(!el||isNaN(s))return; s=Math.max(0,parseInt(s)); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sg=s%60; el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sg).padStart(2,'0')}`; el.style.display='block';}
        async function loadVagasOcupadasAdmin() { 
            try { 
                const vagasOcupadas = await fetchAdminAPI('/vagas/ocupadas'); 
                if(vagasOcupadas){ 
                    atualizarSelectVagasOcupadas(vagasOcupadas); 
                    atualizarDisplayTemposEstacionados(vagasOcupadas); 
                }
            } catch(e){
                console.error("Erro ao recarregar vagas ocupadas:", e);
            } 
        }
        function atualizarSelectVagasOcupadas(list){ const s=document.getElementById('vagasOcupadasSelect'); s.innerHTML='<option value="">-- Selecione --</option>'; list.forEach(v=>{const o=document.createElement('option');o.value=v.id; o.text=`Vaga ${v.numero}${v.placa?` (${v.placa})`:''}`; s.add(o);}); }
        
        // Armazena as vagas ocupadas para atualização em tempo real
        let vagasOcupadasCache = [];
        
        function atualizarDisplayTemposEstacionados(list){ 
            vagasOcupadasCache = list; // Armazena para atualização em tempo real
            const d=document.getElementById('temposEstacionados'); 
            d.innerHTML='<h3><i class="fas fa-history"></i> Veículos Estacionados</h3>'; 
            if(list.length===0){
                d.innerHTML+='<p class="text-muted">Nenhum veículo.</p>';
                return;
            } 
            list.forEach(v=>{
                // Calcula tempo em tempo real baseado na entrada
                const entradaDate = v.entrada ? new Date(v.entrada) : null;
                let tempoMs = 0;
                if (entradaDate && !isNaN(entradaDate.getTime())) {
                    tempoMs = Date.now() - entradaDate.getTime();
                }
                const tF = formatarTempoLocal(tempoMs); 
                d.innerHTML+=`<p data-vaga-id="${Number(v.id)}"><strong>Vaga ${escapeHtml(v.numero)} ${v.placa?`(${escapeHtml(v.placa)})`:''}:</strong> <span class="tempo-real">${escapeHtml(tF)}</span></p>`;
            });
        }
        
        // Atualiza os tempos em tempo real a cada segundo
        setInterval(() => {
            if (vagasOcupadasCache && vagasOcupadasCache.length > 0) {
                vagasOcupadasCache.forEach(v => {
                    const entradaDate = v.entrada ? new Date(v.entrada) : null;
                    if (entradaDate && !isNaN(entradaDate.getTime())) {
                        const tempoMs = Date.now() - entradaDate.getTime();
                        const tF = formatarTempoLocal(tempoMs);
                        // Atualiza apenas o span do tempo
                        const vagaEl = document.querySelector(`#temposEstacionados p[data-vaga-id="${v.id}"] .tempo-real`);
                        if (vagaEl) {
                            vagaEl.textContent = tF;
                        }
                    }
                });
            }
        }, 1000); // Atualiza a cada 1 segundo
        
        function formatarTempoLocal(ms){ if(isNaN(ms)||ms<0)return "00:00:00"; const s=Math.floor(ms/1000); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sg=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sg).padStart(2,'0')}`; } // Helper local
        function atualizarPaginacao(){ const pUl=document.getElementById('pagination'); pUl.innerHTML=''; const nP=Math.ceil(todasAsVagas.length/VAGAS_POR_PAGINA); if(nP<=1)return; const cPI=(txt,pNum,dis=false,act=false,nav=false)=>{const li=document.createElement('li');li.className=`page-item ${dis?'disabled':''} ${act?'active':''}`; const a=document.createElement('a'); a.className='page-link'; a.href='#'; a.innerHTML=txt; if(!dis)a.onclick=(e)=>{e.preventDefault();mudarPagina(pNum);}; li.appendChild(a); return li;}; pUl.appendChild(cPI('«',paginaAtual-1,paginaAtual===1)); for(let i=1;i<=nP;i++)pUl.appendChild(cPI(i,i,false,i===paginaAtual)); pUl.appendChild(cPI('»',paginaAtual+1,paginaAtual===nP)); }
        function mudarPagina(p){ paginaAtual=p; exibirVagas(); atualizarPaginacao(); }
        function abrirModalEntrada(n){ document.getElementById('entradaModalLabel').querySelector('span').textContent=n; document.getElementById('modalVagaNumeroHidden').value=n; document.getElementById('entradaForm').reset(); document.getElementById('modalEstacionamentoIdHidden').value = ESTACIONAMENTO_ID_PADRAO; hideAdminAlert('entradaModalAlert'); $('#entradaModal').modal('show'); }
        async function handleRegistrarEntrada(event){ const btn=event.target.closest('button'); showAdminLoading(btn,true,'Registrar'); hideAdminAlert('entradaModalAlert'); try{const numVaga=document.getElementById('modalVagaNumeroHidden').value; const placa=document.getElementById('modalPlaca').value.trim().toUpperCase(); const tipo=document.getElementById('modalTipoVeiculo').value; const estId=document.getElementById('modalEstacionamentoIdHidden').value; if(!placa){throw new Error('Placa obrigatória.');} const data = await fetchAdminAPI(`/vagas/${numVaga}/entrada`,{method:'POST',body:JSON.stringify({placa,tipoVeiculo:tipo,estacionamentoId:estId})}); showAdminAlert('Entrada OK','success','entradaModalAlert'); setTimeout(()=>{$('#entradaModal').modal('hide');},1000); /* Socket atualiza grid */}catch(e){showAdminAlert(`Erro: ${e?.data?.message||e.message}`,'danger','entradaModalAlert');} finally{showAdminLoading(btn,false,'Registrar');} }
        async function handleRegistrarSaida(event){ const btn=event.target.closest('button'); const sel=document.getElementById('vagasOcupadasSelect'); const vId=sel.value; if(!vId){alert('Selecione.');return;} if(!confirm(`Saída da ${sel.options[sel.selectedIndex].text}?`))return; showAdminLoading(btn,true,'Registrar Saída'); hideAdminAlert('vagas-feedback'); try{ await fetchAdminAPI(`/vagas/${vId}/saida`,{method:'POST'}); showAdminAlert('Saída OK','success','vagas-feedback'); /* Socket atualiza grid/lista */ }catch(e){showAdminAlert(`Erro: ${e?.data?.message||e.message}`,'danger','vagas-feedback');} finally{showAdminLoading(btn,false,'Registrar Saída');} }
        async function handleAtualizarNumeroDeVagas(event){ const btn=event.target.closest('button'); const numInput=document.getElementById('numeroDeVagas'); const novoNum=parseInt(numInput.value); const estId=document.getElementById('estacionamentoIdConfig').value; if(isNaN(novoNum)||novoNum<0){alert('Número inválido.');return;} if(!confirm(`Definir total de vagas para ${novoNum}?`))return; showAdminLoading(btn,true,'Atualizar'); hideAdminAlert('vagas-feedback'); try{ const data = await fetchAdminAPI('/config/vagas',{method:'PUT',body:JSON.stringify({numeroDeVagas:novoNum,estacionamentoId:estId})}); showAdminAlert(data.success||'Vagas atualizadas.','success','vagas-feedback'); await carregarDadosIniciais();}catch(e){showAdminAlert(`Erro: ${e?.data?.message||e.message}`,'danger','vagas-feedback');}finally{showAdminLoading(btn,false,'Atualizar');} }

        // --- UI Estacionamentos ---
        function renderEstacionamentos(lista) { const t = document.getElementById('estacionamentosTableBody'); t.innerHTML = ''; if(lista?.length){ lista.forEach(e => { t.innerHTML += `<tr><td>${e.id}</td><td>${e.nome||''}</td><td>${e.endereco||''}</td><td>${e.vagas_total||0}</td><td>R$ ${parseFloat(e.preco_hora||0).toFixed(2)}</td><td>R$ ${parseFloat(e.preco_dia||0).toFixed(2)}</td><td>${e.admin_id||''}</td><td class="action-buttons"> <button class="btn btn-sm btn-info" onclick="prepareEstacionamentoModal(${e.id})" title="Editar"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="handleDeleteEstacionamento(${e.id},'${e.nome?.replace(/'/g,"\\'")}')" title="Excluir"><i class="fas fa-trash"></i></button></td></tr>`; }); } else { t.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Nenhum correspondente.</td></tr>'; } }
        async function loadEstacionamentosAdmin() { const t = document.getElementById('estacionamentosTableBody'); t.innerHTML = '<tr><td colspan=8 class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>'; try { const d = await fetchAdminAPI('/estacionamentos'); todosEstacionamentos = d || []; renderEstacionamentos(todosEstacionamentos); } catch (e) { t.innerHTML = `<tr><td colspan=8 class="text-center text-danger py-4">Erro: ${escapeHtml(e.message)}</td></tr>`; } }
        function filterEstacionamentos() { const s = document.getElementById('searchEstacionamento').value.toLowerCase(); const f = todosEstacionamentos.filter(e => (e.nome?.toLowerCase().includes(s) || e.endereco?.toLowerCase().includes(s))); renderEstacionamentos(f); }
        function prepareEstacionamentoModal(id) { hideAdminAlert('estModalAlert'); const f=document.getElementById('estacionamentoForm'); f.reset(); document.getElementById('editEstacionamentoId').value = id || ''; if(id){ document.getElementById('estacionamentoModalLabel').textContent = `Editar Est. #${id}`; fetchAdminAPI(`/estacionamentos/${id}`).then(e => { if(!e) throw new Error('N/A'); $('#estNome').val(e.nome||''); $('#estAdminId').val(e.admin_id||''); $('#estEndereco').val(e.endereco||''); $('#estLat').val(e.latitude||''); $('#estLon').val(e.longitude||''); $('#estVagas').val(e.vagas||0); $('#estPrecoHora').val(parseFloat(e.preco_hora||0).toFixed(2)); $('#estPrecoDia').val(parseFloat(e.preco_dia||0).toFixed(2)); $('#estDescricao').val(e.descricao||''); }).catch(err=>showAdminAlert(`Erro ao carregar: ${err.message}`,'danger','estModalAlert'));} else { document.getElementById('estacionamentoModalLabel').textContent='Novo Est.';}}
        async function handleSaveEstacionamento(event){ const btn=event.target.closest('button'); showAdminLoading(btn,true); hideAdminAlert('estModalAlert'); try{ const id=document.getElementById('editEstacionamentoId').value; const d={nome:$('#estNome').val().trim(),admin_id:parseInt($('#estAdminId').val())||null,endereco:$('#estEndereco').val().trim(),latitude:$('#estLat').val().trim()||null,longitude:$('#estLon').val().trim()||null,vagas:parseInt($('#estVagas').val())||0,preco_hora:parseFloat($('#estPrecoHora').val())||0.00,preco_dia:parseFloat($('#estPrecoDia').val())||0.00,descricao:$('#estDescricao').val().trim()||null}; if(!d.nome||!d.endereco||!d.admin_id||isNaN(d.vagas)||isNaN(d.preco_hora)||isNaN(d.preco_dia)){throw new Error("Campos obrigatórios inválidos.");} const url=id?`/estacionamentos/${id}`:'/estacionamentos'; const method=id?'PUT':'POST'; const r=await fetchAdminAPI(url,{method,body:JSON.stringify(d)}); showAdminAlert(r.success||'Salvo!','success','estModalAlert'); loadEstacionamentosAdmin(); setTimeout(()=>{$('#estacionamentoModal').modal('hide');},1000);}catch(e){showAdminAlert(`Erro: ${e?.data?.message||e.message}`,'danger','estModalAlert');}finally{showAdminLoading(btn,false);}}
        async function handleDeleteEstacionamento(id,nome){ if(!confirm(`EXCLUIR "${nome}" (${id}) e TODAS as suas vagas?`))return; hideAdminAlert('estacionamentos-feedback'); try{ await fetchAdminAPI(`/estacionamentos/${id}`,{method:'DELETE'}); showAdminAlert('Excluído!','success','estacionamentos-feedback'); loadEstacionamentosAdmin();}catch(e){showAdminAlert(`Erro: ${e.message}`,'danger','estacionamentos-feedback');}}

        // --- UI Usuários ---
        function renderUsuarios(lista) { const t = document.getElementById('usuariosTableBody'); t.innerHTML = ''; if(lista?.length){ lista.forEach(u=>{const a=u.status==='ativo'; t.innerHTML += `<tr><td>${u.id}</td><td>${u.nome||''}</td><td>${u.email||''}</td><td>${u.telefone||''}</td><td>${u.placa_veiculo||''}</td><td><span class="badge badge-${a?'success':'secondary'}">${u.status}</span></td><td class="action-buttons"><button class="btn btn-sm btn-${a?'warning':'success'}" onclick="handleToggleUserStatus(${u.id},'${a?'inativo':'ativo'}','${u.nome?.replace(/'/g,"\\'")}', event)" title="${a?'Desativar':'Ativar'}"><i class="fas fa-${a?'user-slash':'user-check'}"></i></button></td></tr>`;});}else{t.innerHTML='<tr><td colspan="7" class="text-center text-muted py-3">Nenhum correspondente.</td></tr>';}}
        async function loadUsuariosAdmin() { 
            const t = document.getElementById('usuariosTableBody'); 
            t.innerHTML = '<tr><td colspan=7 class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>'; 
            try { 
                // Get the current parking lot ID from the URL or a global variable
                const urlParams = new URLSearchParams(window.location.search);
                const estacionamentoId = urlParams.get('estacionamentoId') || 1; // Default to 1 if not specified
                
                // Fetch users filtered by parking lot
                const d = await fetchAdminAPI(`/users?estacionamentoId=${estacionamentoId}`); 
                todosUsuarios = d || []; 
                renderUsuarios(todosUsuarios); 
            } catch (e) { 
                console.error('Erro ao carregar usuários:', e);
                t.innerHTML = `<tr><td colspan=7 class="text-center text-danger py-4">Erro: ${escapeHtml(e.message)}</td></tr>`;
            }
        }
        function filterUsuarios() { const s = document.getElementById('searchUsuario').value.toLowerCase(); const f = todosUsuarios.filter(u => (u.nome?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s) || u.placa_veiculo?.toLowerCase().includes(s))); renderUsuarios(f); }
        async function handleToggleUserStatus(id, status, nome, event) { const btn = event.target.closest('button'); const icon=btn.querySelector('i'); const origClass=icon.className; btn.disabled=true; icon.className='fas fa-spinner fa-spin'; hideAdminAlert('usuarios-feedback'); if(!confirm(`${status==='ativo'?'ATIVAR':'DESATIVAR'} "${nome}" (${id})?`)){btn.disabled=false; icon.className=origClass; return;} try{const r=await fetchAdminAPI(`/users/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}); showAdminAlert(r.success||'Status alterado.','success','usuarios-feedback'); loadUsuariosAdmin();}catch(e){showAdminAlert(`Erro: ${e.message}`,'danger','usuarios-feedback');}finally{btn.disabled=false;icon.className=origClass;}}

        // --- Carregamento de Dados Iniciais ---
        async function carregarDadosIniciais() {
            hideAdminAlert('vagas-feedback');
            const vagasContainer = document.getElementById('vagasContainer');
            if (vagasContainer) vagasContainer.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i> Carregando dados...</div>';
            
            try {
                // Carregar dados do estacionamento
                console.log("Tentando carregar dados do estacionamento...");
                const estacionamentos = await fetchAdminAPI('/estacionamentos');
                console.log("Resposta de estacionamentos:", estacionamentos);
                
                if (!estacionamentos || estacionamentos.length === 0) {
                    throw new Error('Nenhum estacionamento encontrado');
                }
                
                // Pegando o primeiro estacionamento da lista
                const firstEst = estacionamentos[0];
                
                // Atualizar campos com os dados do estacionamento
                document.getElementById('estacionamentoIdConfig').value = firstEst.id || '';
                document.getElementById('numeroDeVagas').value = firstEst.vagas_total || 0;
                
                // Carregar vagas do estacionamento
                let vagas = [];
                try {
                    console.log(`Tentando carregar vagas do estacionamento ${firstEst.id}...`);
                    const response = await fetchAdminAPI(`/estacionamentos/${firstEst.id}/vagas`);
                    console.log("Resposta da API de vagas:", response);
                    
                    // Verificar se a resposta é um array e tem itens
                    if (Array.isArray(response)) {
                        vagas = response;
                    } else if (response && response.data && Array.isArray(response.data)) {
                        vagas = response.data;
                    } else if (response && response.vagas && Array.isArray(response.vagas)) {
                        vagas = response.vagas;
                    } else {
                        console.warn("Formato de resposta inesperado para vagas:", response);
                        vagas = [];
                    }
                    
                    console.log("Vagas processadas:", vagas);
                } catch (error) {
                    console.error("Erro ao carregar vagas:", error);
                    showAdminAlert(`Erro ao carregar vagas: ${error.message || 'Erro desconhecido'}`, 'danger', 'vagas-feedback');
                    vagas = [];
                }
                
                todasAsVagas = vagas || [];
                
                // Renderizar vagas na interface
                renderizarVagas(todasAsVagas);
                
                // Carregar vagas ocupadas para o select
                loadVagasOcupadasAdmin();
                
                return firstEst;
            } catch (error) {
                console.error('Erro ao carregar dados iniciais:', error);
                showAdminAlert(`Erro ao carregar dados: ${error.message || 'Desconhecido'}`, 'danger', 'vagas-feedback');
                if (vagasContainer) {
                    vagasContainer.innerHTML = '<div class="alert alert-danger mx-auto my-4">Falha ao carregar dados do estacionamento</div>';
                }
                return null;
            }
        }

        // Função auxiliar para renderizar vagas
        function renderizarVagas(vagas) {
            const container = document.getElementById('vagasContainer');
            if (!container) return;
            
            if (!vagas || vagas.length === 0) {
                container.innerHTML = '<div class="alert alert-info">Nenhuma vaga encontrada para este estacionamento.</div>';
                return;
            }
            
            let html = '<div class="row g-3">';
            vagas.forEach(vaga => {
                const ocupada = vaga.ocupada || vaga.status === 'ocupada';
                html += `
                <div class="col-md-3 col-sm-4 col-6">
                    <div class="card h-100 ${ocupada ? 'border-danger' : 'border-success'}" style="height: 180px;">
                        <div class="card-body d-flex flex-column justify-content-between p-3">
                            <div class="text-center">
                                <h5 class="card-title mb-2" style="font-size: 1.1rem; font-weight: 600;">Vaga ${escapeHtml(vaga.numero)}</h5>
                                <span class="badge ${ocupada ? 'bg-danger' : 'bg-success'} mb-3 px-3 py-2" style="font-size: 0.85rem;">
                                    ${ocupada ? 'OCUPADA' : 'LIVRE'}
                                </span>
                            </div>
                            <div class="mt-auto text-center">
                                ${!ocupada ? 
                                    `<button class="btn btn-sm btn-outline-success w-100" onclick="abrirModalEntrada(${Number(vaga.numero)})" style="font-size: 0.85rem; padding: 0.4rem 0.5rem;">
                                        <i class="fas fa-parking me-1"></i> Registrar Entrada
                                    </button>` : 
                                    `<button class="btn btn-sm btn-outline-danger w-100" onclick="handleRegistrarSaida(event)" data-vaga-id="${Number(vaga.id)}" style="font-size: 0.85rem; padding: 0.4rem 0.5rem;">
                                        <i class="fas fa-sign-out-alt me-1"></i> Registrar Saída
                                    </button>`
                                }
                            </div>
                        </div>
                    </div>
                </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            
            // Adicionar event listeners aos botões de saída
            document.querySelectorAll('button[data-vaga-id]').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const vagaId = this.getAttribute('data-vaga-id');
                    if (vagaId) {
                        document.getElementById('vagasOcupadasSelect').value = vagaId;
                        handleRegistrarSaida(e);
                    }
                });
            });
        }

        // --- Inicialização ---
        document.addEventListener('DOMContentLoaded', async () => { 
            const t = getAdminToken(); 
            if(t) { 
                console.log("Token de admin encontrado, carregando dados...");
                try {
                    await carregarDadosIniciais(); 
                    await loadEstacionamentosAdmin(); 
                    await loadUsuariosAdmin(); 
                    if(config?.realtime?.enabled ?? true) connectAdminSocketIO();
                } catch (err) {
                    console.error("Erro ao carregar dados iniciais:", err);
                    showAdminAlert("Erro ao carregar dados. Por favor, recarregue a página.", "danger");
                }
            } else {
                console.warn("Token de admin não encontrado, redirecionando...");
                window.location.href = '/admin_home/admin-home.html';
            }
            
            const lo = document.getElementById('logoutButton'); 
            if(lo) lo.addEventListener('click', (e) => {
                e.preventDefault();
                logoutAdmin();
            }); 
            
            // Event listeners para abas
            $('a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
                const tg = $(e.target).attr("href"); 
                if (tg === '#estacionamentosContent' && todosEstacionamentos.length === 0) {
                    loadEstacionamentosAdmin(); 
                } else if (tg === '#usuariosContent' && todosUsuarios.length === 0) {
                    loadUsuariosAdmin(); 
                } else if (tg === '#vagasContent' && todasAsVagas.length === 0) {
                    carregarDadosIniciais();
                }
            }); 
            
            // Event listeners para busca
            document.getElementById('searchEstacionamento')?.addEventListener('input', filterEstacionamentos); 
            document.getElementById('searchUsuario')?.addEventListener('input', filterUsuarios); 
            
            // Cleanup ao fechar página
            window.addEventListener('beforeunload', disconnectAdminSocketIO); 
        });
