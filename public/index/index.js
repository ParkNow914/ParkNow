// public/index/index.js
// Script principal para a landing page (index.html)
// Lida com modais de login, cadastro, esqueci senha, newsletter e contato

// Logs de depuracao desativados por padrao; ligue com localStorage.setItem('parknow_debug','1')
window.PARKNOW_DEBUG = (typeof window.PARKNOW_DEBUG !== 'undefined')
    ? window.PARKNOW_DEBUG
    : (() => { try { return localStorage.getItem('parknow_debug') === '1'; } catch (_e) { return false; } })();
function debugLog(...args) { if (window.PARKNOW_DEBUG) console.log(...args); }
// Escapa valores dinamicos interpolados em templates HTML (anti-XSS)
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

document.addEventListener("DOMContentLoaded", function() {
    // Seletores Globais (evita repetição)
    const registerForm = document.getElementById('registerUserForm');
    const loginForm = document.getElementById('loginUserForm');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm'); // No modal
    const newsletterForm = document.getElementById('newsletterForm');
    const contatoForm = document.getElementById('contatoForm');

    // --- Funções de Feedback Visual ---
    const showLoading = (form, isLoading) => {
        const submitButton = form?.querySelector('button[type="submit"]');
        if (!submitButton) return;
        submitButton.disabled = isLoading;
        const spinner = submitButton.querySelector('.spinner-border');
        const icon = submitButton.querySelector('i'); // Pega o ícone se existir
        let defaultText = 'Enviar';

        // Determina texto padrão baseado no form ou botão
        if (form.id === 'loginUserForm') defaultText = 'Entrar';
        else if (form.id === 'registerUserForm') defaultText = 'Cadastrar';
        else if (form.id === 'forgotPasswordForm') defaultText = 'Enviar Link';
        else if (form.id === 'resetPasswordForm') defaultText = 'Redefinir Senha';
        else if (form.id === 'newsletterForm') defaultText = 'Inscrever-se';
        else if (form.id === 'contatoForm') defaultText = 'Enviar Mensagem';
        else defaultText = submitButton.textContent.replace('Carregando...', '').trim(); // Tenta pegar do botão


        if (isLoading) {
            if(icon) icon.style.marginRight = '5px'; // Adiciona espaço se tiver ícone
            if(spinner) spinner.style.display = 'inline-block';
             // Remove texto existente e adiciona loading
            let textNode = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0);
            if(textNode) textNode.nodeValue = ' Processando...'; else submitButton.insertAdjacentText('beforeend', ' Processando...');

        } else {
            if(icon) icon.style.marginRight = '0.5rem'; // Restaura margem do ícone
            if(spinner) spinner.style.display = 'none';
             // Remove texto "Processando..."
             let loadingTextNode = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('Processando'));
             if(loadingTextNode) submitButton.removeChild(loadingTextNode);
            // Restaura texto padrão se não houver mais texto
            let currentTextContent = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE)?.nodeValue?.trim();
             if(!currentTextContent) submitButton.insertAdjacentText(icon ? 'beforeend' : 'afterbegin', ` ${defaultText}`);
        }
    };

    const showAlert = (elementId, message, type = 'danger') => {
        const feedbackElement = document.getElementById(elementId);
        if (feedbackElement) {
            feedbackElement.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show m-0" role="alert" style="font-size: 0.9rem; padding: .6rem 1rem;">${escapeHtml(message)}<button type="button" class="close" data-dismiss="alert" aria-label="Close" style="padding: .6rem 1rem;"><span aria-hidden="true">×</span></button></div>`;
            feedbackElement.style.display = 'block';
        } else { console.warn(`Elemento ${elementId} N/A.`); alert(`[${type.toUpperCase()}] ${message}`); }
    };
    const hideAlert = (elementId) => { const fb=document.getElementById(elementId); if(fb) fb.style.display = 'none'; };

    // Feedback do link de verificação de e-mail (GET /api/auth/verify-email/:token
    // redireciona para /?email_verificado=sucesso|invalido|expirado|erro)
    (function mostrarFeedbackVerificacaoEmail() {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('email_verificado');
        if (!status) return;
        const mensagens = {
            sucesso: ['✅ E-mail confirmado com sucesso! Você já pode fazer login.', 'success'],
            invalido: ['Link de verificação inválido. Solicite um novo e-mail de confirmação.', 'danger'],
            expirado: ['O link de verificação expirou (validade de 24h). Faça login para reenviar.', 'warning'],
            erro: ['Não foi possível verificar seu e-mail agora. Tente novamente mais tarde.', 'danger'],
        };
        const [mensagem, tipo] = mensagens[status] || mensagens.erro;
        // Banner fixo no topo (independe dos containers de formulário)
        const banner = document.createElement('div');
        banner.className = `alert alert-${tipo} text-center mb-0`;
        banner.setAttribute('role', 'alert');
        banner.style.cssText = 'position:sticky;top:0;z-index:2000;border-radius:0;';
        banner.textContent = mensagem;
        const fechar = document.createElement('button');
        fechar.type = 'button';
        fechar.className = 'close';
        fechar.setAttribute('aria-label', 'Fechar');
        fechar.innerHTML = '<span aria-hidden="true">&times;</span>';
        fechar.addEventListener('click', () => banner.remove());
        banner.appendChild(fechar);
        document.body.prepend(banner);
        // Limpa o parâmetro da URL sem recarregar
        params.delete('email_verificado');
        const novaQuery = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (novaQuery ? `?${novaQuery}` : ''));
        if (status === 'sucesso') setTimeout(() => banner.remove(), 10000);
    })();

    // --- Validação e Submissão de Formulários ---

    // CADASTRO
    if (registerForm) {
        registerForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const feedbackId = 'register-feedback'; hideAlert(feedbackId);
            
            // Validar senha e confirmação antes da validação geral
            const passwordInput = document.getElementById('newPassword');
            const confirmSenhaInput = document.getElementById('confirmarSenha');
            
            clearErrorFor(passwordInput);
            clearErrorFor(confirmSenhaInput);
            
            // Validação de senha
            if (passwordInput.value.length < 6) {
                setErrorFor(passwordInput, 'Senha deve ter no mínimo 6 caracteres.');
                showAlert(feedbackId, "Corrija os erros destacados.", 'warning');
                return;
            }
            
            // Validação de confirmação de senha
            if (passwordInput.value !== confirmSenhaInput.value) {
                setErrorFor(confirmSenhaInput, 'As senhas não coincidem.');
                showAlert(feedbackId, "Corrija os erros destacados.", 'warning');
                return;
            }
            
            if (!validateForm(registerForm)) { showAlert(feedbackId, "Corrija os erros destacados.", 'warning'); return; }
            showLoading(registerForm, true);
            
            // Em vez de usar FormData, vamos criar o objeto manualmente para garantir campos corretos
            const telefoneValue = document.getElementById('newTelefone').value;
            // Remove todos os caracteres não numéricos do telefone
            const telefoneFormatado = telefoneValue.replace(/\D/g, '');
            
            // Formata a placa para maiúsculas e remove espaços
            const placaValue = document.getElementById('placaVeiculo').value;
            const placaFormatada = placaValue.trim().toUpperCase();
            
            // Mantém o formato do CPF se estiver preenchido
            const cpfValue = document.getElementById('newCpf').value;
            
            const dataToSend = {
                nome: document.getElementById('newUsername').value,
                email: document.getElementById('newEmail').value,
                senha: document.getElementById('newPassword').value,
                confirmarSenha: document.getElementById('confirmarSenha').value,
                telefone: telefoneFormatado, // Apenas dígitos
                tipo_veiculo: document.getElementById('tipoVeiculo').value, // Adicionado tipo de veículo
                placa_veiculo: placaFormatada, // Maiúsculas sem espaços
                cpf: cpfValue // Formato original
            };

            try {
                const response = await fetch('/api/auth/register', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(dataToSend) 
                });
                const result = await response.json();
                
                // Adiciona log detalhado para depuração
                debugLog('Resposta do servidor:', result);
                if (result.errors) {
                    debugLog('Erros de validação detalhados:', result.errors);
                }
                
                if (!response.ok) { handleApiError(result, response.status, feedbackId); return; } // Usa helper de erro
                showAlert(feedbackId, result.message || 'Cadastro realizado! Faça o login.', 'success');
                registerForm.reset(); setTimeout(() => { $('#registerForm').modal('hide'); }, 2500);
            } catch (error) { showAlert(feedbackId, `Erro: ${error.message}`, 'danger');
            } finally { showLoading(registerForm, false); }
        });
    }

    // LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            const feedbackId = 'login-feedback'; hideAlert(feedbackId);
            
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            
            // Limpa erros anteriores
            clearErrorFor(emailInput);
            clearErrorFor(passwordInput);
            
            // Validação dos campos
            let isValid = true;
            
            if (!emailInput.value.trim()) {
                setErrorFor(emailInput, 'Email é obrigatório.');
                isValid = false;
            } else if (!validateEmail(emailInput.value)) {
                setErrorFor(emailInput, 'Email inválido.');
                isValid = false;
            }
            
            if (!passwordInput.value) {
                setErrorFor(passwordInput, 'Senha é obrigatória.');
                isValid = false;
            }
            
            if (!isValid) {
                showAlert(feedbackId, 'Por favor, preencha todos os campos corretamente.', 'warning');
                return;
            }
            
            showLoading(loginForm, true);
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailInput.value, senha: passwordInput.value })
                });
                const result = await response.json();
                
                if (response.ok) {
                    // Salva credenciais no localStorage
                    localStorage.setItem('authToken', result.accessToken);
                    localStorage.setItem('userId', result.user.id);
                    
                    // Dispara evento auth:login para o notificationService
                    const authEvent = new CustomEvent('auth:login', {
                        detail: {
                            userId: result.user.id,
                            token: result.accessToken
                        }
                    });
                    document.dispatchEvent(authEvent);
                    debugLog('[Login] Disparando evento auth:login para notificationService');
                    
                    // Inicializa notificationService diretamente se disponível
                    if (window.notificationService) {
                        debugLog('[Login] Inicializando notificationService diretamente');
                        window.notificationService.init({
                            userId: result.user.id,
                            token: result.accessToken,
                            soundEnabled: true
                        });
                    }
                    
                    showAlert(feedbackId, 'Login realizado com sucesso! Redirecionando...', 'success');
                    setTimeout(() => { window.location.href = '/user/home.html'; }, 1000);
                } else {
                    handleApiError(result, response.status, feedbackId);
                }
            } catch (error) { showAlert(feedbackId, `Erro: ${error.message}`, 'danger');
            } finally { showLoading(loginForm, false); }
        });
    }

    // ESQUECI SENHA
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackId = 'forgot-feedback'; hideAlert(feedbackId);
            const emailInput = document.getElementById('forgotEmail');
            clearErrorFor(emailInput); // Limpa erro anterior
            if (!validateEmail(emailInput.value)) { setErrorFor(emailInput, 'Email inválido.'); return; }
            showLoading(forgotPasswordForm, true);
            try {
                const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput.value }) });
                const result = await response.json();
                if (!response.ok) { handleApiError(result, response.status, feedbackId); return; }
                showAlert(feedbackId, result.message || 'Solicitação enviada.', 'info');
                // Não limpa form para user ver msg
            } catch (error) { showAlert(feedbackId, `Erro: ${error.message}`, 'danger');
            } finally { showLoading(forgotPasswordForm, false); }
        });
    }

    // RESET SENHA (MODAL)
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackId = 'reset-feedback'; const tokenInput = document.getElementById('resetToken');
            const passwordInput = document.getElementById('resetPasswordInput'); const confirmInput = document.getElementById('resetPasswordConfirm');
            let isValid = true; hideAlert(feedbackId); clearErrorFor(passwordInput); clearErrorFor(confirmInput);

            if (passwordInput.value.length < 6) { setErrorFor(passwordInput, 'Mínimo 6 caracteres.'); isValid = false; }
            if (passwordInput.value !== confirmInput.value) { setErrorFor(confirmInput, 'Senhas não coincidem.'); isValid = false; }
            if (!tokenInput.value) { showAlert(feedbackId, 'Token inválido/ausente.', 'danger'); isValid = false; }
            if (!isValid) return; showLoading(resetPasswordForm, true);

            try {
                const response = await fetch(`/api/auth/reset-password/${tokenInput.value}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passwordInput.value }) });
                const result = await response.json();
                if (!response.ok) { handleApiError(result, response.status, feedbackId); return; }
                showAlert(feedbackId, result.message || 'Senha redefinida!', 'success');
                resetPasswordForm.reset(); tokenInput.value = ''; // Limpa token também
                setTimeout(() => { $('#resetPasswordModal').modal('hide'); $('#loginModal').modal('show'); }, 3000);
            } catch (error) { showAlert(feedbackId, `Erro: ${error.message}`, 'danger');
            } finally { showLoading(resetPasswordForm, false); }
        });
    }

    // NEWSLETTER
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackId = 'newsletter-feedback'; hideAlert(feedbackId);
            
            // Validar email
            const emailInput = newsletterForm.querySelector('input[name="email"]');
            if (!emailInput || !emailInput.value || !validateEmail(emailInput.value)) {
                setErrorFor(emailInput, 'Email inválido');
                return;
            }
            
            showLoading(newsletterForm, true);
            
            try {
                const response = await fetch('/api/contact/newsletter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: emailInput.value,
                        nome: newsletterForm.querySelector('input[name="nome"]')?.value || ''
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert(feedbackId, result.message || 'Inscrição realizada com sucesso!', 'success');
                    newsletterForm.reset();
                } else {
                    if (result.errors && Array.isArray(result.errors)) {
                        // Tratar erros de validação
                        result.errors.forEach(err => {
                            if (err.param === 'email') {
                                setErrorFor(emailInput, err.msg);
                            }
                        });
                        showAlert(feedbackId, 'Por favor, corrija os erros no formulário.', 'danger');
                    } else {
                        showAlert(feedbackId, result.message || 'Erro ao processar inscrição.', 'danger');
                    }
                }
            } catch (error) {
                console.error('Erro ao inscrever na newsletter:', error);
                showAlert(feedbackId, 'Erro de conexão. Por favor, tente novamente.', 'danger');
            } finally {
                showLoading(newsletterForm, false);
            }
        });
    }
    
    // CONTATO
    if (contatoForm) {
        contatoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackId = 'contato-feedback'; hideAlert(feedbackId);
            
            // Validar todos os campos
            const isValid = validateForm(contatoForm);
            if (!isValid) return;
            
            showLoading(contatoForm, true);
            
            try {
                // Coletar dados do formulário
                const formData = {
                    nome: document.getElementById('contatoNome').value,
                    email: document.getElementById('contatoEmail').value,
                    assunto: document.getElementById('contatoAssunto').value,
                    mensagem: document.getElementById('contatoMensagem').value
                };
                
                // Enviar para a API
                const response = await fetch('/api/contact/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showAlert(feedbackId, result.message || 'Mensagem enviada com sucesso!', 'success');
                    contatoForm.reset();
                } else {
                    if (result.errors && Array.isArray(result.errors)) {
                        // Tratar erros de validação
                        result.errors.forEach(err => {
                            const input = document.getElementById(`contato${err.param.charAt(0).toUpperCase() + err.param.slice(1)}`);
                            if (input) {
                                setErrorFor(input, err.msg);
                            }
                        });
                        showAlert(feedbackId, 'Por favor, corrija os erros no formulário.', 'danger');
                    } else {
                        showAlert(feedbackId, result.message || 'Erro ao enviar mensagem.', 'danger');
                    }
                }
            } catch (error) {
                console.error('Erro ao enviar mensagem de contato:', error);
                showAlert(feedbackId, 'Erro de conexão. Por favor, tente novamente.', 'danger');
            } finally {
                showLoading(contatoForm, false);
            }
        });
    }

    // --- Funções de Validação e Máscara ---
    const setErrorFor = (input, message) => { input.classList.add('is-invalid'); const fb = input.closest('.form-group')?.querySelector('.invalid-feedback'); if (fb) { fb.textContent = message; fb.style.display = 'block'; } return false; };
    const clearErrorFor = (input) => { input.classList.remove('is-invalid'); const fb = input.closest('.form-group')?.querySelector('.invalid-feedback'); if (fb) fb.style.display = 'none'; return true; };
    
    // Validação REAL de CPF (algoritmo completo)
    const validateCPF = (cpf) => {
        if (!cpf) return true; // CPF é opcional
        cpf = cpf.replace(/\D/g, ''); // Remove formatação
        if (cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false; // CPF com todos dígitos iguais
        
        // Validação do primeiro dígito verificador
        let soma = 0;
        for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
        let resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(9))) return false;
        
        // Validação do segundo dígito verificador
        soma = 0;
        for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.charAt(10))) return false;
        
        return true;
    };
    
    function validateForm(form) { 
        let v = true; 
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid')); 
        form.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none'); 
        form.querySelectorAll('input[required], textarea[required], select[required]').forEach(i => { 
            if (!i.value.trim()) v = setErrorFor(i, `Campo obrigatório.`); 
        }); 
        
        // Validação de email
        const eI = form.querySelector('input[name="email"][required]'); 
        if (eI && eI.value.trim() && !validateEmail(eI.value)) v = setErrorFor(eI, 'Email inválido.'); 
        
        // Validação de telefone
        const pI = form.querySelector('input[name="telefone"][required]'); 
        if (pI && pI.value.trim() && !validatePhone(pI.value)) v = setErrorFor(pI, 'Telefone inválido (10-11 dígitos).'); 
        else if (pI?.value.trim()) pI.value = formatPhone(pI.value); 
        
        // Validação de placa
        const plI = form.querySelector('input[name="placa_veiculo"][required]'); 
        if (plI && plI.value.trim()) { 
            plI.value = plI.value.toUpperCase().replace(/\s/g, ''); 
            if (!validatePlaca(plI.value)) v = setErrorFor(plI, 'Placa inválida (AAA0000 ou AAA0A00).'); 
            else clearErrorFor(plI); 
        } 
        
        // Validação de CPF (opcional mas se preenchido deve ser válido)
        const cpI = form.querySelector('input[name="cpf"]'); 
        if (cpI && cpI.value.trim()) {
            cpI.value = formatCpf(cpI.value); // Formata primeiro
            if (!validateCPF(cpI.value)) v = setErrorFor(cpI, 'CPF inválido.'); 
            else clearErrorFor(cpI);
        } else if(cpI) clearErrorFor(cpI); 
        
        // Validação de senha
        const pwI = form.querySelector('input[name="senha"][type="password"]'); 
        if (pwI && pwI.required && pwI.value.trim().length < 6) v = setErrorFor(pwI, 'Senha deve ter no mínimo 6 caracteres.'); 
        
        // Confirmação de senha
        const cpwI = form.querySelector('input[name="confirmPassword"]'); 
        if (cpwI && pwI && cpwI.value !== pwI.value) v = setErrorFor(cpwI, 'As senhas não coincidem.'); 
        
        return v; 
    }
    
    const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).toLowerCase());
    const validatePhone = (p) => { const d = p.replace(/\D/g, ''); return d.length === 10 || d.length === 11; };
    const validatePlaca = (p) => { if(!p) return false; p = p.toUpperCase().replace(/\s/g, ''); return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p); };
    const _validateCpfFormat = (c) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(c);
    const formatPhone = (v) => { if(!v)return v; const d=v.replace(/\D/g,'').slice(0,11); const l=d.length; if(l<=2)return`(${d}`; if(l<=6)return`(${d.slice(0,2)}) ${d.slice(2)}`; if(l<=10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`; return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`};
    const formatCpf = (v) => { if(!v)return v; const d=v.replace(/\D/g,'').slice(0,11); const l=d.length; if(l<=3)return d; if(l<=6)return`${d.slice(0,3)}.${d.slice(3)}`; if(l<=9)return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`; return`${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`};
    
    // Aplicar máscaras em tempo real
    document.querySelectorAll('input[name="telefone"]').forEach(el => el.addEventListener('input', (e) => e.target.value = formatPhone(e.target.value)));
    document.querySelectorAll('input[name="cpf"]').forEach(el => {
        el.addEventListener('input', (e) => e.target.value = formatCpf(e.target.value));
        el.addEventListener('blur', (e) => {
            if (e.target.value && !validateCPF(e.target.value)) {
                setErrorFor(e.target, 'CPF inválido.');
            } else {
                clearErrorFor(e.target);
            }
        });
    });
    document.querySelectorAll('input[name="placa_veiculo"]').forEach(el => {
        el.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/\s/g, '');
            // Limita a 7 caracteres
            if (e.target.value.length > 7) e.target.value = e.target.value.slice(0, 7);
        });
        el.addEventListener('blur', (e) => {
            if (e.target.value && !validatePlaca(e.target.value)) {
                setErrorFor(e.target, 'Placa inválida.');
            } else {
                clearErrorFor(e.target);
            }
        });
    });
    
    // Validação em tempo real para TODOS os campos do formulário de cadastro
    if (registerForm) {
        // Nome - validação em tempo real
        const nomeInput = document.getElementById('newUsername');
        if (nomeInput) {
            nomeInput.addEventListener('blur', (e) => {
                if (!e.target.value.trim()) {
                    setErrorFor(e.target, 'Nome completo é obrigatório.');
                } else if (e.target.value.trim().length < 3) {
                    setErrorFor(e.target, 'Nome deve ter pelo menos 3 caracteres.');
                } else {
                    clearErrorFor(e.target);
                }
            });
            nomeInput.addEventListener('input', (e) => {
                if (e.target.classList.contains('is-invalid') && e.target.value.trim().length >= 3) {
                    clearErrorFor(e.target);
                }
            });
        }
        
        // Email - validação em tempo real
        const emailInput = document.getElementById('newEmail');
        if (emailInput) {
            emailInput.addEventListener('blur', (e) => {
                if (!e.target.value.trim()) {
                    setErrorFor(e.target, 'Email é obrigatório.');
                } else if (!validateEmail(e.target.value)) {
                    setErrorFor(e.target, 'Email inválido.');
                } else {
                    clearErrorFor(e.target);
                }
            });
            emailInput.addEventListener('input', (e) => {
                if (e.target.classList.contains('is-invalid') && validateEmail(e.target.value)) {
                    clearErrorFor(e.target);
                }
            });
        }
        
        // Senha - validação em tempo real
        const senhaInput = document.getElementById('newPassword');
        if (senhaInput) {
            senhaInput.addEventListener('blur', (e) => {
                if (!e.target.value) {
                    setErrorFor(e.target, 'Senha é obrigatória.');
                } else if (e.target.value.length < 6) {
                    setErrorFor(e.target, 'Senha deve ter no mínimo 6 caracteres.');
                } else {
                    clearErrorFor(e.target);
                }
            });
            senhaInput.addEventListener('input', (e) => {
                if (e.target.classList.contains('is-invalid') && e.target.value.length >= 6) {
                    clearErrorFor(e.target);
                }
                // Valida confirmação se já foi preenchida
                const confirmInput = document.getElementById('confirmarSenha');
                if (confirmInput && confirmInput.value) {
                    if (e.target.value !== confirmInput.value) {
                        setErrorFor(confirmInput, 'As senhas não coincidem.');
                    } else {
                        clearErrorFor(confirmInput);
                    }
                }
            });
        }
        
        // Confirmar Senha - validação em tempo real
        const confirmSenhaInput = document.getElementById('confirmarSenha');
        if (confirmSenhaInput) {
            confirmSenhaInput.addEventListener('blur', (e) => {
                const senhaValue = document.getElementById('newPassword')?.value;
                if (!e.target.value) {
                    setErrorFor(e.target, 'Confirmação de senha é obrigatória.');
                } else if (e.target.value !== senhaValue) {
                    setErrorFor(e.target, 'As senhas não coincidem.');
                } else {
                    clearErrorFor(e.target);
                }
            });
            confirmSenhaInput.addEventListener('input', (e) => {
                const senhaValue = document.getElementById('newPassword')?.value;
                if (e.target.value === senhaValue) {
                    clearErrorFor(e.target);
                }
            });
        }
        
        // Telefone - validação em tempo real
        const telefoneInput = document.getElementById('newTelefone');
        if (telefoneInput) {
            telefoneInput.addEventListener('blur', (e) => {
                if (!e.target.value.trim()) {
                    setErrorFor(e.target, 'Telefone é obrigatório.');
                } else if (!validatePhone(e.target.value)) {
                    setErrorFor(e.target, 'Telefone inválido (10-11 dígitos).');
                } else {
                    clearErrorFor(e.target);
                }
            });
            telefoneInput.addEventListener('input', (e) => {
                if (e.target.classList.contains('is-invalid') && validatePhone(e.target.value)) {
                    clearErrorFor(e.target);
                }
            });
        }
        
        // Tipo de Veículo - validação em tempo real
        const tipoVeiculoSelect = document.getElementById('tipoVeiculo');
        if (tipoVeiculoSelect) {
            tipoVeiculoSelect.addEventListener('change', (e) => {
                if (!e.target.value) {
                    setErrorFor(e.target, 'Selecione o tipo de veículo.');
                } else {
                    clearErrorFor(e.target);
                }
            });
            tipoVeiculoSelect.addEventListener('blur', (e) => {
                if (!e.target.value) {
                    setErrorFor(e.target, 'Tipo de veículo é obrigatório.');
                } else {
                    clearErrorFor(e.target);
                }
            });
        }
    }

    // --- Helper para Tratar Erros da API ---
    function handleApiError(result, status, feedbackId) {
        let message = result.message || `Erro inesperado (${status})`;
        // Se for erro de validação (422) vindo do express-validator
        if (status === 422 && result.errors) {
            message = result.errors.map(err => err.msg).join('<br>'); // Junta mensagens
            // Tenta destacar os campos inválidos no formulário (se os IDs coincidirem)
            const formId = feedbackId.replace('-feedback', 'Form'); // Ex: 'login-feedback' -> 'loginForm'
            const form = document.getElementById(formId);
            if (form) {
                result.errors.forEach(err => {
                    const inputElement = form.querySelector(`[name="${err.param}"]`);
                    if (inputElement) setErrorFor(inputElement, err.msg);
                });
            }
             message = `Erro de validação:<br>${message}`; // Adiciona prefixo
        }
        showAlert(feedbackId, message, 'danger');
    }

    // --- Inicialização do Mapa Leaflet ---
    try { var map = L.map('map',{zoomControl: false}).setView([-22.786,-45.184], 16); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OSM' }).addTo(map); L.control.zoom({position: 'bottomright'}).addTo(map); const cM = (p) => map.setView([p.coords.latitude, p.coords.longitude], 16); const hE = (e) => console.warn("Geo Err:",e.message); const mapDiv = document.getElementById('map'); if (mapDiv) { mapDiv.addEventListener('click', function() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(cM, hE, {enableHighAccuracy:true, timeout:8000, maximumAge:60000}); } else { console.warn("Geoloc N/A"); } }); } }
    catch(e) { console.error("Erro mapa:", e); const mapDiv = document.getElementById('map'); if(mapDiv) mapDiv.innerHTML = '<p class="text-danger text-center p-5">Mapa indisponível.</p>'; }

    // --- Lógica para pegar token da URL e abrir modal reset ---
    const checkResetToken = () => { const h=window.location.hash; if(h.startsWith('#/reset-password/')){ const t=h.substring('#/reset-password/'.length); if(t&&/^[a-f0-9]{64}$/.test(t)){ const ti=document.getElementById('resetToken'); if(ti){ti.value=t; $('.modal').modal('hide'); setTimeout(()=>{$('#resetPasswordModal').modal('show');},300);}else console.error("Input #resetToken N/A."); }else console.warn("Token reset URL inválido."); if(window.location.hash.includes('reset-password')) history.pushState("",document.title,window.location.pathname+window.location.search); }};
    checkResetToken(); window.addEventListener('hashchange', checkResetToken);

    // --- Limpeza de formulários ao fechar modais ---
    $('#loginModal').on('hidden.bs.modal', function () {
        if (loginForm) {
            loginForm.reset();
            // Limpa todos os erros de validação
            loginForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            loginForm.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none');
            hideAlert('login-feedback');
        }
    });

    $('#registerForm').on('hidden.bs.modal', function () {
        if (registerForm) {
            registerForm.reset();
            // Limpa todos os erros de validação
            registerForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            registerForm.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none');
            hideAlert('register-feedback');
        }
    });

    $('#forgotPasswordModal').on('hidden.bs.modal', function () {
        if (forgotPasswordForm) {
            forgotPasswordForm.reset();
            // Limpa todos os erros de validação
            forgotPasswordForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            forgotPasswordForm.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none');
            hideAlert('forgot-feedback');
        }
    });

    $('#resetPasswordModal').on('hidden.bs.modal', function () {
        if (resetPasswordForm) {
            resetPasswordForm.reset();
            // Limpa todos os erros de validação
            resetPasswordForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
            resetPasswordForm.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none');
            hideAlert('reset-feedback');
        }
    });

}); // Fim DOMContentLoaded