// Extraído de public/reset-password.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Script JS para reset-password.html (Conteúdo de /js/reset-password.js)
        document.addEventListener('DOMContentLoaded', () => {
            const resetForm = document.getElementById('resetPasswordFormPage');
            const tokenInput = document.getElementById('resetTokenPage');
            const passwordInput = document.getElementById('resetPasswordInputPage');
            const confirmInput = document.getElementById('resetPasswordConfirmPage');
            const feedbackDiv = document.getElementById('reset-page-feedback');
            const submitButton = resetForm?.querySelector('button[type="submit"]');

            // --- Funções Feedback ---
            const showLoading = (isLoading) => { if(!submitButton) return; submitButton.disabled = isLoading; const s=submitButton.querySelector('.spinner-border'); const i=submitButton.querySelector('i'); if(isLoading){if(i)i.style.display='none'; if(s)s.style.display='inline-block'; let tN=Array.from(submitButton.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim().length>0); if(tN)tN.nodeValue=' Redefinindo...'; else submitButton.insertAdjacentText('beforeend', ' Redefinindo...');} else {if(i)i.style.display=''; if(s)s.style.display='none'; let lTN=Array.from(submitButton.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.includes('Redefinindo')); if(lTN)submitButton.removeChild(lTN); let cT=Array.from(submitButton.childNodes).find(n=>n.nodeType===Node.TEXT_NODE)?.nodeValue?.trim(); if(!cT) submitButton.insertAdjacentText(i?'beforeend':'afterbegin',' Redefinir Senha');}};
            const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            const showAlert = (message, type = 'danger') => { if(feedbackDiv){ feedbackDiv.innerHTML=`<div class="alert alert-${type} alert-dismissible fade show m-0" role="alert">${escapeHtml(message)}<button type="button" class="close" data-dismiss="alert">×</button></div>`; feedbackDiv.style.display='block'; } else { alert(message); }};
            const hideAlert = () => { if(feedbackDiv) feedbackDiv.style.display = 'none'; };
            const setErrorFor = (input, message) => { if(!input) return; input.classList.add('is-invalid'); const el=input.parentNode.querySelector('.invalid-feedback'); if(el) {el.textContent=message; el.style.display='block';}};
            const clearErrorFor = (input) => { if(!input) return; input.classList.remove('is-invalid'); const el=input.parentNode.querySelector('.invalid-feedback'); if(el) el.style.display='none';};

            // --- Extração Token ---
            const extractTokenFromURL = () => { const p=window.location.pathname.split('/'); return p.find(part => /^[a-f0-9]{64}$/i.test(part)) || null; };
            const token = extractTokenFromURL();
            if (token && tokenInput) { tokenInput.value = token; } else { showAlert('Token inválido ou não encontrado na URL.', 'danger'); if(submitButton) submitButton.disabled = true; }

            // --- Submit Handler ---
            if (resetForm && token) {
                resetForm.addEventListener('submit', async (e) => {
                    e.preventDefault(); let isValid = true; hideAlert(); clearErrorFor(passwordInput); clearErrorFor(confirmInput);
                    if (passwordInput.value.length < 6) { setErrorFor(passwordInput, 'Mínimo 6 caracteres.'); isValid = false; }
                    if (passwordInput.value !== confirmInput.value) { setErrorFor(confirmInput, 'Senhas não coincidem.'); isValid = false; }
                    if (!isValid) return; showLoading(true);
                    try {
                        const response = await fetch(`/api/auth/reset-password/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: passwordInput.value }) });
                        const result = await response.json(); if (!response.ok) { if(response.status===422&&result.errors)throw new Error(result.errors.map(er=>er.msg).join(' ')); throw new Error(result.message||`Erro ${response.status}`); }
                        showAlert(result.message || 'Senha redefinida! Volte e faça login.', 'success'); resetForm.reset(); if(submitButton) submitButton.disabled = true;
                        // Opcional: Redirecionar
                        // setTimeout(() => { window.location.href = '/index.html'; }, 4000);
                    } catch (error) { showAlert(`Erro: ${error.message}`, 'danger');
                    } finally { showLoading(false); }
                });
            } else if (resetForm && !token) { showAlert('Não foi possível encontrar o token.', 'warning'); if(submitButton) submitButton.disabled = true; }
        });
