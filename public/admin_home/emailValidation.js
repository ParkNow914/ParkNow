/**
 * Validação de e-mail em tempo real para o formulário de registro
 * Melhorias implementadas:
 * - Melhor tratamento de erros e feedback ao usuário
 * - Otimização de performance
 * - Validação mais robusta
 */
document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const registerEmailInput = document.querySelector('#registerForm input[type="email"][name="email"]');
    if (!registerEmailInput) return;

    // Estado da validação
    const state = {
        isValid: false,
        isChecking: false,
        lastValidationTime: 0,
        currentValidationId: 0,
        lastTypedValue: '',
        debounceTimer: null
    };

    // Constantes
    const VALIDATION_DEBOUNCE = 500; // 500ms de debounce (reduzido para melhor UX)
    const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 dias em ms
    const API_TIMEOUT = 15000; // 15 segundos de timeout para a API
    
    // Configurações da API
    const API_CONFIG = {
        endpoint: '/api/validate-email/validate',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        options: {
            allowDisposable: false,
            allowFree: true,
            validateMx: true,
            validateSmtp: false
        }
    };

    /**
     * Retorna o ícone correspondente ao status
     * @param {string} type - Tipo de status (loading, valid, invalid, warning)
     * @returns {string} HTML do ícone
     */
    const getStatusIcon = (type) => {
        const icons = {
            loading: '<div class="spinner-border spinner-border-sm" role="status"></div>',
            valid: '<i class="bi bi-check-circle-fill text-success" aria-hidden="true"></i>',
            invalid: '<i class="bi bi-x-circle-fill text-danger" aria-hidden="true"></i>',
            warning: '<i class="bi bi-exclamation-triangle-fill text-warning" aria-hidden="true"></i>',
            info: '<i class="bi bi-info-circle-fill text-info" aria-hidden="true"></i>'
        };
        return icons[type] || '';
    };

    // Função para exibir feedback de validação com animação
    const showEmailFeedback = (input, message, type = 'info') => {
        const emailGroup = input.closest('.form-group');
        if (!emailGroup) return;

        // Cria ou atualiza o container de feedback
        let feedbackContainer = emailGroup.querySelector('.email-feedback-container');
        if (!feedbackContainer) {
            feedbackContainer = document.createElement('div');
            feedbackContainer.className = 'email-feedback-container d-flex align-items-center mt-1';
            emailGroup.appendChild(feedbackContainer);
        }
        
        // Atualiza ícone
        const iconMap = {
            valid: 'valid',
            invalid: 'invalid',
            warning: 'warning',
            verifying: 'loading'
        };
        const iconType = iconMap[type] || 'info';
        
        // Se for verificação em andamento, mostra apenas o spinner
        if (type === 'verifying') {
            feedbackContainer.innerHTML = getStatusIcon(iconType);
        } else {
            feedbackContainer.innerHTML = `${getStatusIcon(iconType)} <span class="ms-2">${message}</span>`;
        }

        // Animações
        feedbackContainer.style.opacity = '0';
        feedbackContainer.style.transition = 'opacity 0.3s ease-in-out';
        setTimeout(() => {
            feedbackContainer.style.opacity = '1';
        }, 10);

        // Classes de validação do Bootstrap
        input.classList.remove('is-valid', 'is-invalid', 'is-warning');
        if (type === 'valid') {
            input.classList.add('is-valid');
        } else if (type === 'invalid' || type === 'warning') {
            input.classList.add('is-invalid');
        }
    };

    // Função para verificar cache
    const checkEmailCache = (email) => {
        try {
            const cache = localStorage.getItem('emailValidationCache');
            if (!cache) return null;
            
            const cacheData = JSON.parse(cache);
            const cachedResult = cacheData[email];
            
            if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_EXPIRY) {
                return cachedResult.data;
            }
        } catch (e) {
            console.warn('Erro ao acessar cache de validação de e-mail:', e);
        }
        return null;
    };

    // Função para salvar no cache
    const saveToCache = (email, data) => {
        try {
            const cache = JSON.parse(localStorage.getItem('emailValidationCache') || '{}');
            cache[email] = {
                data,
                timestamp: Date.now()
            };
            localStorage.setItem('emailValidationCache', JSON.stringify(cache));
        } catch (e) {
            console.warn('Erro ao salvar no cache de validação de e-mail:', e);
        }
    };

    /**
     * Valida o formato básico de e-mail
     * @param {string} email - E-mail a ser validado
     * @returns {boolean} True se o formato for válido
     */
    const validateEmailFormat = (email) => {
        if (!email) return false;
        
        // Regex melhorado para validação de e-mail (RFC 5322)
        const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return emailRegex.test(email);
    };

    /**
     * Valida o domínio do e-mail
     * @param {string} email - E-mail a ser validado
     * @returns {boolean} True se o domínio for válido
     */
    const validateEmailDomain = (email) => {
        if (!email.includes('@')) return false;
        
        const domain = email.split('@')[1];
        if (!domain) return false;
        
        // Verifica se o domínio tem pelo menos um ponto e não começa ou termina com ponto
        // e tem um TLD válido (pelo menos 2 caracteres)
        return /^(?!\.)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?<!\.)$/.test(domain);
    };

    /**
     * Valida o e-mail usando a API
     * @param {string} email - E-mail a ser validado
     * @param {number} validationId - ID da validação atual
     * @param {AbortSignal} signal - Sinal para cancelamento
     * @returns {Promise<boolean>} Promessa que resolve para true se o e-mail for válido
     */
    const validateEmail = async (email, validationId, signal) => {
        // Se o sinal já estiver abortado, não faz nada
        if (signal?.aborted) return false;
        
        // Atualiza o estado
        state.isChecking = true;
        state.isValid = false;
        
        // Verifica o cache primeiro
        const cachedResult = checkEmailCache(email);
        if (cachedResult) {
            state.isChecking = false;
            state.isValid = cachedResult.valid;
            state.lastValidationTime = Date.now();
            
            const message = cachedResult.valid 
                ? 'E-mail válido!'
                : cachedResult.message || 'E-mail inválido';
                
            showEmailFeedback(
                registerEmailInput, 
                message, 
                cachedResult.valid ? 'valid' : 'invalid'
            );
            
            return cachedResult.valid;
        }
        
        // Validação básica de formato
        if (!validateEmailFormat(email)) {
            state.isValid = false;
            state.isChecking = false;
            showEmailFeedback(registerEmailInput, 'Formato de e-mail inválido. Use o formato: exemplo@dominio.com', 'invalid');
            return false;
        }
        
        // Validação de domínio
        if (!validateEmailDomain(email)) {
            state.isValid = false;
            state.isChecking = false;
            showEmailFeedback(registerEmailInput, 'Domínio de e-mail inválido ou incompleto.', 'invalid');
            return false;
        }
        
        // Mostra feedback de carregamento (apenas spinner, sem texto)
        showEmailFeedback(registerEmailInput, '', 'verifying');
        
        const controller = new AbortController();
        let timeoutId;
        let timeoutFired = false;
        
        try {
            // Configura o timeout
            timeoutId = setTimeout(() => {
                timeoutFired = true;
                controller.abort('timeout');
            }, API_TIMEOUT);
            
            // Conecta o sinal externo ao controlador
            if (signal) {
                signal.addEventListener('abort', () => controller.abort(), { once: true });
            }
            
            // Prepara o corpo da requisição
            const requestBody = {
                email,
                options: API_CONFIG.options
            };
            
            // Faz a requisição para a API
            const response = await fetch(API_CONFIG.endpoint, {
                method: 'POST',
                headers: {
                    ...API_CONFIG.headers,
                    'X-Request-ID': `client-${Date.now()}-${Math.floor(Math.random() * 1000)}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            // Limpa o timeout se a requisição for concluída a tempo
            clearTimeout(timeoutId);
            
            // Se o sinal foi abortado, lança um erro
            if (signal?.aborted) {
                throw new DOMException('A validação foi cancelada', 'AbortError');
            }
            
            // Processa a resposta
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('Erro ao processar resposta JSON:', jsonError);
                throw new Error('Não foi possível processar a resposta do servidor');
            }
            
            // Atualiza o timestamp da última validação
            state.lastValidationTime = Date.now();
            
            // Verifica se a resposta foi bem-sucedida
            if (!response.ok) {
                // Mapeia códigos de erro para mensagens amigáveis
                const errorMessages = {
                    'validation_error': 'Formato de e-mail inválido',
                    'rate_limit_exceeded': 'Muitas tentativas. Por favor, aguarde um momento.',
                    'invalid_domain': 'Domínio de e-mail inválido ou não existe',
                    'disposable_email': 'E-mails descartáveis não são permitidos',
                    'free_email_not_allowed': 'E-mails de serviços gratuitos não são permitidos',
                    'mx_validation_failed': 'Não foi possível validar o servidor de e-mail',
                    'domain_analysis_failed': 'Não foi possível analisar o domínio do e-mail',
                    'server_error': 'Erro interno do servidor. Tente novamente mais tarde.'
                };
                
                const errorMessage = data?.error?.code && errorMessages[data.error.code] 
                    ? errorMessages[data.error.code]
                    : data?.message || data?.error?.message || `Erro na validação (${response.status})`;
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.code = data?.error?.code;
                error.details = data?.error?.details;
                
                // Salva o erro no cache para evitar novas requisições
                saveToCache(email, {
                    valid: false,
                    message: errorMessage,
                    timestamp: Date.now()
                });
                
                throw error;
            }
            
            // Processa a resposta da API
            if (data.valid) {
                // Atualiza o estado
                state.isValid = true;
                state.isChecking = false;
                
                // Salva no cache
                saveToCache(email, {
                    ...data,
                    timestamp: Date.now()
                });
                
                // Mostra feedback apropriado
                if (data.isFreeEmail) {
                    showEmailFeedback(
                        registerEmailInput, 
                        'E-mail válido! (Recomendamos o uso de e-mail corporativo para melhor atendimento)', 
                        'warning'
                    );
                } else {
                    showEmailFeedback(
                        registerEmailInput, 
                        'E-mail válido!', 
                        'valid'
                    );
                }
                
                return true;
            } else {
                // E-mail inválido
                state.isValid = false;
                state.isChecking = false;
                
                // Salva o erro no cache
                saveToCache(email, {
                    valid: false,
                    message: data.message || 'E-mail inválido ou não existe',
                    timestamp: Date.now()
                });
                
                // Mostra feedback de erro
                showEmailFeedback(
                    registerEmailInput, 
                    data.message || 'E-mail inválido ou não existe', 
                    'invalid'
                );
                
                return false;
            }
            
        } catch (error) {
            // Limpa o timeout em caso de erro
            if (timeoutId) clearTimeout(timeoutId);
            
            // Se for um erro de cancelamento, apenas ignora
            if (error.name === 'AbortError' && error.message === 'A validação foi cancelada') {
                return false; // Não mostra mensagem para cancelamentos normais
            }
            
            console.error('Erro ao validar e-mail:', error);
            
            // Tratamento específico para timeout
            if (error.name === 'AbortError' && timeoutFired) {
                state.isValid = false;
                state.isChecking = false;
                showEmailFeedback(
                    registerEmailInput,
                    'A validação está demorando muito. Verifique sua conexão e tente novamente.',
                    'warning'
                );
                return false;
            }

            // Mensagens de erro mais amigáveis
            let errorMessage = 'Não foi possível validar o e-mail';
            let errorType = 'warning';
            
            // Mapeia códigos de erro para mensagens amigáveis
            const errorMessages = {
                'validation_error': 'Formato de e-mail inválido',
                'rate_limit_exceeded': 'Muitas tentativas. Por favor, aguarde um momento.',
                'invalid_domain': 'Domínio de e-mail inválido',
                'disposable_email': 'E-mails descartáveis não são permitidos',
                'free_email_not_allowed': 'E-mails de serviços gratuitos não são permitidos',
                'mx_validation_failed': 'Não foi possível validar o servidor de e-mail',
                'domain_analysis_failed': 'Não foi possível analisar o domínio do e-mail',
                'network_error': 'Erro de conexão. Verifique sua internet.',
                'timeout_error': 'A validação está demorando muito. Tente novamente.'
            };
            
            // Determina a mensagem de erro com base no tipo de erro
            if (error.code && errorMessages[error.code]) {
                errorMessage = errorMessages[error.code];
            } 
            else if (error.status >= 400 && error.status < 500) {
                errorMessage = error.message || errorMessage;
            }
            else if (error.status >= 500) {
                errorMessage = 'Ocorreu um erro no servidor. Por favor, tente novamente mais tarde.';
                errorType = 'error';
            }
            else if (error.name === 'TypeError' || error.message.includes('Failed to fetch')) {
                errorMessage = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.';
                errorType = 'error';
            }
            else if (error.name === 'AbortError' || error.message.includes('timeout')) {
                errorMessage = 'A validação está demorando muito. Verifique sua conexão e tente novamente.';
                errorType = 'warning';
            }
            
            // Atualiza o estado
            state.isValid = false;
            state.isChecking = false;
            
            // Exibe o feedback de erro
            showEmailFeedback(registerEmailInput, errorMessage, errorType);
            
            // Em caso de erro de rede, faz uma validação básica no cliente
            if (errorType === 'warning' && !error.status) {
                const domain = email.split('@')[1]?.toLowerCase();
                if (domain && validateEmailDomain(email)) {
                    // Salva no cache como válido apenas para esta sessão
                    saveToCache(email, {
                        valid: true,
                        message: 'E-mail validado localmente',
                        timestamp: Date.now(),
                        localValidation: true
                    });
                    
                    showEmailFeedback(
                        registerEmailInput, 
                        'E-mail validado localmente (sem verificação do servidor)', 
                        'warning'
                    );
                    
                    state.isValid = true;
                    return true;
                }
            }
            
            return false;
            
        } finally {
            // Atualiza o estado apenas se ainda for a validação atual
            if (validationId === state.currentValidationId) {
                state.isChecking = false;
            }
        }
    };

    /**
     * Limpa o feedback de validação do e-mail
     */
    const clearEmailFeedback = () => {
        const emailGroup = registerEmailInput.closest('.form-group');
        if (!emailGroup) return;
        
        const feedbackContainer = emailGroup.querySelector('.email-feedback-container');
        if (feedbackContainer) {
            // Adiciona animação de fade out
            feedbackContainer.style.opacity = '0';
            feedbackContainer.style.transition = 'opacity 0.3s ease-in-out';
            
            // Remove o elemento após a animação
            setTimeout(() => {
                if (feedbackContainer.parentNode === emailGroup) {
                    emailGroup.removeChild(feedbackContainer);
                }
            }, 300);
        }
        
        // Remove classes de validação do input
        registerEmailInput.classList.remove('is-valid', 'is-invalid');
    };

    /**
     * Cancela a validação em andamento, se houver
     */
    const cancelCurrentValidation = () => {
        // Incrementa o ID da validação para invalidar qualquer validação em andamento
        state.currentValidationId++;
        
        // Cancela a requisição atual, se existir
        if (state.currentController) {
            state.currentController.abort('Validação cancelada pelo usuário');
            state.currentController = null;
        }
        
        // Limpa o timer de debounce
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
            state.debounceTimer = null;
        }
    };

    /**
     * Inicia a validação do e-mail após um atraso
     * @param {string} email - E-mail a ser validado
     */
    const startEmailValidation = (email) => {
        // Cancela qualquer validação em andamento
        cancelCurrentValidation();
        
        // Gera um novo ID para esta validação
        const validationId = Date.now();
        state.currentValidationId = validationId;
        
        // Cria um novo controlador para a requisição
        const controller = new AbortController();
        state.currentController = controller;
        
        // Executa a validação completa
        validateEmail(email, validationId, controller.signal)
            .then(isValid => {
                state.isValid = isValid;
            })
            .catch(error => {
                if (error.name !== 'AbortError') {
                    console.error('Erro na validação:', error);
                }
            })
            .finally(() => {
                if (state.currentValidationId === validationId) {
                    state.currentController = null;
                }
            });
    };
    
    /**
     * Manipulador de eventos para o input de e-mail
     */
    const handleEmailInput = (e) => {
        const email = e.target.value.trim();
        
        // Limpa o timer de debounce anterior
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
            state.debounceTimer = null;
        }
        
        // Se o campo estiver vazio, limpa o feedback
        if (!email) {
            cancelCurrentValidation();
            clearEmailFeedback();
            state.isValid = false;
            state.lastTypedValue = '';
            return;
        }
        
        // Se o valor não mudou desde a última validação, não faz nada
        if (email === state.lastTypedValue) return;
        state.lastTypedValue = email;
        
        // Validação básica de formato imediata
        if (!validateEmailFormat(email)) {
            showEmailFeedback(registerEmailInput, 'Formato de e-mail inválido. Use: exemplo@dominio.com', 'invalid');
            state.isValid = false;
            return;
        }
        
        // Validação de domínio básica
        if (!validateEmailDomain(email)) {
            showEmailFeedback(registerEmailInput, 'Domínio de e-mail inválido ou incompleto', 'invalid');
            state.isValid = false;
            return;
        }
        
        // Se o formato for válido, mostra feedback positivo básico (apenas spinner)
        showEmailFeedback(registerEmailInput, '', 'verifying');
        
        // Aplica debounce progressivo (mais curto para respostas em cache)
        const cachedResult = checkEmailCache(email);
        const debounceTime = cachedResult ? 200 : 500; // Resposta mais rápida para cache
        
        state.debounceTimer = setTimeout(() => {
            startEmailValidation(email);
        }, debounceTime);
    };
    
    // Adiciona o event listener para o input
    registerEmailInput.addEventListener('input', handleEmailInput);
    
    /**
     * Manipulador de eventos para quando o campo perde o foco
     */
    const handleEmailBlur = (e) => {
        const email = e.target.value.trim();
        
        // Limpa o timer de debounce
        if (state.debounceTimer) {
            clearTimeout(state.debounceTimer);
            state.debounceTimer = null;
        }
        
        // Se o campo estiver vazio, limpa o feedback
        if (!email) {
            cancelCurrentValidation();
            clearEmailFeedback();
            return;
        }
        
        // Se já é válido, não precisa validar novamente
        if (state.isValid) return;
        
        // Se estiver em processo de validação, aguarda terminar
        if (state.isChecking) {
            // Mostra feedback de carregamento (apenas spinner)
            showEmailFeedback(registerEmailInput, '', 'verifying');
            return;
        }
        
        // Se não for um e-mail válido, mostra mensagem de erro
        if (!validateEmailFormat(email) || !validateEmailDomain(email)) {
            showEmailFeedback(
                registerEmailInput, 
                'Por favor, insira um endereço de e-mail válido', 
                'invalid'
            );
            return;
        }
        
        // Se chegou até aqui, inicia a validação
        startEmailValidation(email);
    };
    
    // Adiciona o event listener para o evento blur
    registerEmailInput.addEventListener('blur', handleEmailBlur);
    
    /**
     * Manipulador de eventos para o envio do formulário
     */
    const handleFormSubmit = async (e) => {
        const email = registerEmailInput.value.trim();
        
        // Se o campo estiver vazio, mostra erro e previne o envio
        if (!email) {
            e.preventDefault();
            showEmailFeedback(registerEmailInput, 'Por favor, insira um endereço de e-mail.', 'invalid');
            registerEmailInput.focus();
            return;
        }
        
        // Se já validou e é válido, permite o envio
        if (state.isValid) {
            return; // Permite o envio do formulário
        }
        
        // Se estiver em processo de validação, aguarda terminar
        if (state.isChecking) {
            e.preventDefault();
            showEmailFeedback(registerEmailInput, '', 'verifying');
            
            // Tenta novamente após um curto período
            setTimeout(() => {
                if (state.isValid) {
                    registerForm.submit();
                } else {
                    showEmailFeedback(registerEmailInput, 'Não foi possível validar o e-mail. Tente novamente.', 'invalid');
                }
            }, 1000);
            return;
        }
        
        // Se o formato for inválido, mostra erro
        if (!validateEmailFormat(email) || !validateEmailDomain(email)) {
            e.preventDefault();
            showEmailFeedback(
                registerEmailInput, 
                'Por favor, insira um endereço de e-mail válido', 
                'invalid'
            );
            registerEmailInput.focus();
            return;
        }
        
        // Se chegou até aqui, tenta validar o e-mail antes de enviar
        e.preventDefault();
        showEmailFeedback(registerEmailInput, '', 'verifying');
        
        try {
            const isValid = await validateEmail(email, Date.now(), null);
            
            if (isValid) {
                // Adiciona uma pequena pausa para o usuário ver o feedback
                setTimeout(() => {
                    registerForm.submit();
                }, 300);
            } else {
                registerEmailInput.focus();
            }
        } catch (error) {
            console.error('Erro ao validar e-mail:', error);
            showEmailFeedback(
                registerEmailInput, 
                'Não foi possível validar o e-mail. Tente novamente.', 
                'error'
            );
            registerEmailInput.focus();
        }
    };
    
    // Adiciona o event listener para o formulário de registro
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleFormSubmit);
    }
    
    // Adiciona estilos para feedback visual
    const style = document.createElement('style');
    style.textContent = `
        .email-feedback-container {
            font-size: 0.875rem;
            margin-top: 0.25rem;
            transition: opacity 0.3s ease-in-out;
        }
        .email-feedback-container i {
            margin-right: 0.5rem;
        }
        .form-control.is-valid, .form-control.is-invalid {
            background-position: right calc(0.375em + 0.1875rem) center;
            padding-right: 2.25rem;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
            animation: fadeIn 0.3s ease-out forwards;
        }
    `;
    document.head.appendChild(style);
});
