// public/js/reset-password.js
// Script dedicado para a página reset-password.html

document.addEventListener('DOMContentLoaded', () => {
    // Seletores específicos da página reset-password.html
    const resetForm = document.getElementById('resetPasswordFormPage');
    const tokenInput = document.getElementById('resetTokenPage');
    const passwordInput = document.getElementById('resetPasswordInputPage');
    const confirmInput = document.getElementById('resetPasswordConfirmPage');
    const feedbackDiv = document.getElementById('reset-page-feedback');
    const submitButton = resetForm?.querySelector('button[type="submit"]');
    const backLink = document.querySelector('.link-voltar'); // Link para voltar

    // --- Funções de Feedback Visual ---
    const showLoading = (isLoading) => {
        if (!submitButton) return;
        submitButton.disabled = isLoading;
        const spinner = submitButton.querySelector('.spinner-border');
        const icon = submitButton.querySelector('i');
        if (isLoading) {
            if(icon) icon.style.display = 'none';
            if(spinner) spinner.style.display = 'inline-block';
            let textNode = Array.from(submitButton.childNodes).find(n=>n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length > 0);
            if(textNode) textNode.nodeValue = ' Redefinindo...'; else submitButton.insertAdjacentText('beforeend', ' Redefinindo...');
        } else {
            if(icon) icon.style.display = '';
            if(spinner) spinner.style.display = 'none';
            let loadingNode = Array.from(submitButton.childNodes).find(n=>n.nodeType === Node.TEXT_NODE && n.nodeValue.includes('Redefinindo'));
            if(loadingNode) submitButton.removeChild(loadingNode);
            let currentText = Array.from(submitButton.childNodes).find(n=>n.nodeType === Node.TEXT_NODE)?.nodeValue?.trim();
            if(!currentText) submitButton.insertAdjacentText(icon ? 'beforeend' : 'afterbegin', ' Redefinir Senha');
        }
    };
    const showAlert = (message, type = 'danger') => { if(feedbackDiv){ feedbackDiv.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show m-0" role="alert">${message}<button type="button" class="close" data-dismiss="alert">×</button></div>`; feedbackDiv.style.display = 'block'; } else { alert(message); }};
    const hideAlert = () => { if(feedbackDiv) feedbackDiv.style.display = 'none'; };
    const setErrorFor = (input, message) => { if(!input) return; input.classList.add('is-invalid'); const el=input.parentNode.querySelector('.invalid-feedback'); if(el) {el.textContent=message; el.style.display='block';}};
    const clearErrorFor = (input) => { if(!input) return; input.classList.remove('is-invalid'); const el=input.parentNode.querySelector('.invalid-feedback'); if(el) el.style.display='none';};

    // --- Extração e Validação do Token da URL ---
    const extractTokenFromURL = () => { const p = window.location.pathname.split('/'); return p.find(part => /^[a-f0-9]{64}$/i.test(part)) || null; };
    const token = extractTokenFromURL();

    if (token && tokenInput) {
        tokenInput.value = token;
        console.log("Token de reset extraído:", token);
    } else {
        showAlert('Token de redefinição inválido ou não encontrado na URL. Por favor, use o link enviado para o seu email.', 'danger');
        if (submitButton) submitButton.disabled = true;
        if (resetForm) resetForm.style.opacity = '0.5'; // Indica visualmente inativo
    }

    // --- Handler de Submissão do Formulário ---
    if (resetForm && token) { // Só ativa se o form e o token foram encontrados
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let isValid = true;
            hideAlert(); clearErrorFor(passwordInput); clearErrorFor(confirmInput);

            // Validação frontend
            if (passwordInput.value.length < 6) { setErrorFor(passwordInput, 'A nova senha deve ter no mínimo 6 caracteres.'); isValid = false; }
            if (passwordInput.value !== confirmInput.value) { setErrorFor(confirmInput, 'As senhas digitadas não coincidem.'); isValid = false; }
            if (!isValid) return;

            showLoading(true);
            try {
                const response = await fetch(`/api/auth/reset-password/${token}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: passwordInput.value }) // Envia a nova senha
                });
                const result = await response.json(); // Tenta ler a resposta

                if (!response.ok) {
                    // Trata erros de validação da API (ex: senha fraca no backend)
                    if (response.status === 422 && result.errors) {
                        throw new Error(result.errors.map(er => er.msg).join(' '));
                    }
                    // Trata outros erros (token inválido/expirado 400, erro 500)
                    throw new Error(result.message || `Erro ${response.status} ao redefinir senha.`);
                }

                // Sucesso!
                showAlert(result.message || 'Senha redefinida com sucesso! Você pode voltar e fazer login.', 'success');
                resetForm.reset(); // Limpa o formulário
                if (submitButton) submitButton.disabled = true; // Desabilita após sucesso
                if (backLink) backLink.textContent = 'Ir para Login'; // Muda texto do link

            } catch (error) {
                // Mostra erro para o usuário
                showAlert(`Erro: ${error.message}`, 'danger');
            } finally {
                // Garante que o estado de loading seja removido
                showLoading(false);
            }
        });
    } else if (resetForm && !token) {
         // Caso o formulário exista mas o token não foi pego da URL (já tratado, mas reforça)
         showAlert('Não foi possível processar. Token de redefinição ausente ou inválido na URL.', 'warning');
         if (submitButton) submitButton.disabled = true;
    }
});