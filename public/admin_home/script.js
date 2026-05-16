// public/admin_home/script.js
// Lida com interface de login/cadastro do admin e interage com API Node.js

document.addEventListener('DOMContentLoaded', () => {
    // Seletores de Formulários e Elementos
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotPasswordAdminForm = document.getElementById('forgotPasswordAdminForm');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const successPopup = $('#successPopup'); // jQuery para modal Bootstrap
    const _btnBuscarCep = document.getElementById('btnBuscarCep');
    const cepInput = document.getElementById('cepEstacionamento');
    const cnpjInput = document.getElementById('cnpj');
    const fotoEstacionamentoInput = document.getElementById('fotoEstacionamento');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const removeImageBtn = document.getElementById('removeImageBtn');

    // ============================================
    // MÁSCARAS E VALIDAÇÕES EM TEMPO REAL
    // ============================================
    
    // Máscara CNPJ com validação avançada
    $('#cnpj').mask('00.000.000/0000-00', {
        onKeyPress: function(cnpj, e, field, _options) {
            // Validação em tempo real
            setTimeout(() => {
                const result = validarCNPJ(cnpj);
                if (cnpj.replace(/\D/g, '').length === 14) {
                    if (result.valido) {
                        field.removeClass('is-invalid').addClass('is-valid');
                        // Consultar Receita Federal (via API pública)
                        consultarCNPJ(cnpj.replace(/\D/g, ''), field);
                    } else {
                        field.removeClass('is-valid').addClass('is-invalid');
                        field.siblings('.invalid-feedback').text(result.mensagem || 'CNPJ inválido');
                    }
                } else {
                    field.removeClass('is-valid is-invalid');
                }
            }, 100);
        }
    });

    // Máscara CEP com validação ViaCEP
    $('#cepEstacionamento').mask('00000-000', {
        onKeyPress: function(cep, e, field, _options) {
            if (cep.replace(/\D/g, '').length === 8) {
                field.removeClass('is-invalid').addClass('is-valid');
            } else {
                field.removeClass('is-valid is-invalid');
            }
        }
    });

    // Máscara Telefone (formato brasileiro com 9 dígitos) + validação DDD
    const SPMaskBehavior = function (val) {
        return val.replace(/\D/g, '').length === 11 ? '(00) 00000-0000' : '(00) 0000-00009';
    };
    const spOptions = {
        onKeyPress: function(val, e, field, options) {
            field.mask(SPMaskBehavior.apply({}, arguments), options);
            const digits = val.replace(/\D/g, '');
            
            // Validar DDD brasileiro
            if (digits.length >= 2) {
                const ddd = parseInt(digits.substring(0, 2));
                const dddValidos = [11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99];
                
                if (!dddValidos.includes(ddd)) {
                    field.removeClass('is-valid').addClass('is-invalid');
                    field.siblings('.invalid-feedback').text('DDD inválido');
                    return;
                }
            }
            
            if (digits.length === 10 || digits.length === 11) {
                // Validar se não é número sequencial
                if (/^(\d)\1+$/.test(digits)) {
                    field.removeClass('is-valid').addClass('is-invalid');
                    field.siblings('.invalid-feedback').text('Telefone inválido');
                } else {
                    field.removeClass('is-invalid').addClass('is-valid');
                }
            } else if (digits.length > 0) {
                field.removeClass('is-valid').addClass('is-invalid');
            } else {
                field.removeClass('is-valid is-invalid');
            }
        }
    };
    $('#telefone').mask(SPMaskBehavior, spOptions);

    // Máscara UF (uppercase automático) + validação estados brasileiros
    $('#ufEstacionamento').on('input', function() {
        this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
        const ufsValidas = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
        
        if (this.value.length === 2) {
            if (ufsValidas.includes(this.value)) {
                $(this).removeClass('is-invalid').addClass('is-valid');
            } else {
                $(this).removeClass('is-valid').addClass('is-invalid');
                $(this).siblings('.invalid-feedback').text('UF inválida');
            }
        } else if (this.value.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Email em tempo real + verificação de domínio
    $('#registerEmail').on('blur', function() {
        const email = $(this).val();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
            if (email) {
                $(this).removeClass('is-valid').addClass('is-invalid');
                $(this).siblings('.invalid-feedback').text('Email inválido');
            }
            return;
        }
        
        // Verificar se não é email temporário/descartável
        const dominiosDescartaveis = ['tempmail.com', 'guerrillamail.com', '10minutemail.com', 'throwaway.email', 'mailinator.com', 'yopmail.com', 'sharklasers.com', 'getnada.com'];
        const dominio = email.split('@')[1].toLowerCase();
        
        if (dominiosDescartaveis.includes(dominio)) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Use um email válido e permanente');
            return;
        }
        
        // Verificar email corporativo para estacionamento
        verificarEmailReal(email, $(this));
    });

    // Validação Nome (mínimo 3 caracteres, apenas letras e espaços)
    $('#nome').on('input', function() {
        const nome = $(this).val().trim();
        const nomeRegex = /^[A-Za-zÀ-ÿ\s]+$/;
        
        if (!nomeRegex.test(nome) && nome.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Nome deve conter apenas letras');
            return;
        }
        
        // Validar nome completo (pelo menos 2 palavras)
        const palavras = nome.split(' ').filter(p => p.length > 0);
        if (palavras.length >= 2 && nome.length >= 5) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (nome.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Digite nome completo (nome e sobrenome)');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Número (apenas números, não permite 0)
    $('#numeroEstacionamento').on('input', function() {
        this.value = this.value.replace(/\D/g, '');
        const numero = parseInt(this.value);
        
        if (numero > 0 && numero <= 999999) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (this.value) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Número inválido');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Número de Vagas (mínimo 1, máximo 10000)
    $('#numeroVagas').on('input', function() {
        this.value = this.value.replace(/\D/g, '');
        const vagas = parseInt(this.value);
        
        if (vagas >= 1 && vagas <= 10000) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (this.value) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Vagas deve ser entre 1 e 10.000');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Preços (formato decimal, mínimo R$ 0.01, máximo R$ 9999.99)
    $('#precoHora, #precoDia').on('input', function() {
        // Remove tudo exceto números e ponto
        this.value = this.value.replace(/[^\d.]/g, '');
        // Permite apenas um ponto decimal
        const parts = this.value.split('.');
        if (parts.length > 2) {
            this.value = parts[0] + '.' + parts.slice(1).join('');
        }
        // Limita a 2 casas decimais
        if (parts[1] && parts[1].length > 2) {
            this.value = parts[0] + '.' + parts[1].slice(0, 2);
        }
        
        const preco = parseFloat(this.value);
        const isPrecoHora = this.id === 'precoHora';
        
        if (preco >= 0.01 && preco <= 9999.99) {
            // Validar preço razoável (hora não deve ser maior que dia)
            if (isPrecoHora) {
                const precoDia = parseFloat($('#precoDia').val()) || 0;
                if (precoDia > 0 && preco > precoDia) {
                    $(this).removeClass('is-valid').addClass('is-invalid');
                    $(this).siblings('.invalid-feedback').text('Preço/hora não pode ser maior que preço/dia');
                    return;
                }
            } else {
                const precoHora = parseFloat($('#precoHora').val()) || 0;
                if (precoHora > 0 && preco < precoHora) {
                    $(this).removeClass('is-valid').addClass('is-invalid');
                    $(this).siblings('.invalid-feedback').text('Preço/dia deve ser maior que preço/hora');
                    return;
                }
            }
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (this.value) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Preço deve ser entre R$ 0,01 e R$ 9.999,99');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Latitude/Longitude com precisão geográfica
    $('#latitude, #longitude').on('input', function() {
        // Permite números negativos e ponto decimal
        this.value = this.value.replace(/[^\d.-]/g, '');
        const coord = parseFloat(this.value);
        const isLat = this.id === 'latitude';
        const min = isLat ? -90 : -180;
        const max = isLat ? 90 : 180;
        
        // Validar coordenadas do Brasil aproximadamente
        // Lat: -33.75 a 5.27, Long: -73.99 a -28.84
        if (!isNaN(coord) && coord >= min && coord <= max) {
            if (isLat && (coord < -33.75 || coord > 5.27)) {
                $(this).removeClass('is-valid').addClass('is-invalid');
                $(this).siblings('.invalid-feedback').text('Coordenada fora do Brasil');
            } else if (!isLat && (coord < -73.99 || coord > -28.84)) {
                $(this).removeClass('is-valid').addClass('is-invalid');
                $(this).siblings('.invalid-feedback').text('Coordenada fora do Brasil');
            } else {
                $(this).removeClass('is-invalid').addClass('is-valid');
            }
        } else if (this.value) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Coordenada inválida');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação campos de texto obrigatórios (sem números ou caracteres especiais excessivos)
    $('#nomeEstacionamento, #bairroEstacionamento, #cidadeEstacionamento').on('input', function() {
        const value = $(this).val().trim();
        
        // Validar caracteres permitidos (letras, números, espaços, hífen)
        const regex = /^[A-Za-z0-9À-ÿ\s\-.]+$/;
        if (!regex.test(value) && value.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Caracteres inválidos detectados');
            return;
        }
        
        if (value.length >= 2) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (value.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Mínimo 2 caracteres');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Logradouro (mais rigorosa)
    $('#logradouroEstacionamento').on('input', function() {
        const value = $(this).val().trim();
        const regex = /^[A-Za-z0-9À-ÿ\s\-.]+$/;
        
        if (!regex.test(value) && value.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Caracteres inválidos detectados');
            return;
        }
        
        // Validar palavras comuns de logradouro
        const tiposValidos = ['rua', 'avenida', 'av', 'r', 'travessa', 'alameda', 'estrada', 'rodovia', 'praça'];
        const primeirasPalavras = value.toLowerCase().split(' ').slice(0, 2).join(' ');
        const temTipoValido = tiposValidos.some(tipo => primeirasPalavras.includes(tipo));
        
        if (value.length >= 5) {
            if (temTipoValido || value.length >= 10) {
                $(this).removeClass('is-invalid').addClass('is-valid');
            } else {
                $(this).removeClass('is-valid').addClass('is-invalid');
                $(this).siblings('.invalid-feedback').text('Inclua tipo de logradouro (Rua, Av, etc)');
            }
        } else if (value.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Chave PIX avançada
    $('#chavePix').on('blur', function() {
        const chave = $(this).val().trim();
        const tipo = $('#tipoChavePix').val();
        
        if (!chave) {
            $(this).removeClass('is-valid is-invalid');
            return;
        }
        
        let valido = false;
        let mensagem = '';
        
        switch(tipo) {
            case 'cpf':
                valido = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(chave) && validarCPF(chave);
                mensagem = 'CPF inválido';
                break;
            case 'cnpj':
                const resultCnpj = validarCNPJ(chave);
                valido = resultCnpj.valido;
                mensagem = resultCnpj.mensagem || 'CNPJ inválido';
                break;
            case 'email':
                valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave);
                mensagem = 'Email inválido';
                break;
            case 'telefone':
                const digits = chave.replace(/\D/g, '');
                valido = digits.length === 10 || digits.length === 11;
                mensagem = 'Telefone inválido';
                break;
            case 'aleatoria':
                valido = /^[a-zA-Z0-9-]{32}$/.test(chave);
                mensagem = 'Chave aleatória deve ter 32 caracteres alfanuméricos';
                break;
            default:
                valido = chave.length >= 5;
        }
        
        if (valido) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text(mensagem);
        }
    });

    // Validação Nome Titular PIX (nome completo, apenas letras)
    $('#nomeTitularPix').on('input', function() {
        const nome = $(this).val().trim();
        const nomeRegex = /^[A-Za-zÀ-ÿ\s]+$/;
        
        if (!nomeRegex.test(nome) && nome.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Nome deve conter apenas letras');
            return;
        }
        
        const palavras = nome.split(' ').filter(p => p.length > 0);
        if (palavras.length >= 2 && nome.length >= 5) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (nome.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Digite nome completo');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // Validação Horários (não permitir fechamento antes da abertura)
    $('#horarioAbertura, #horarioFechamento').on('change', function() {
        const abertura = $('#horarioAbertura').val();
        const fechamento = $('#horarioFechamento').val();
        
        if (abertura && fechamento) {
            if (fechamento <= abertura) {
                $('#horarioFechamento').removeClass('is-valid').addClass('is-invalid');
                $('#horarioFechamento').siblings('.invalid-feedback').text('Fechamento deve ser após abertura');
            } else {
                $('#horarioAbertura').removeClass('is-invalid').addClass('is-valid');
                $('#horarioFechamento').removeClass('is-invalid').addClass('is-valid');
            }
        }
    });

    // Validação Descrição (mínimo 10 caracteres, máximo 500)
    $('#descricao').on('input', function() {
        const desc = $(this).val().trim();
        const contador = $(this).siblings('small').find('.char-count');
        
        if (contador.length) {
            contador.text(`${desc.length}/500`);
        }
        
        if (desc.length >= 10 && desc.length <= 500) {
            $(this).removeClass('is-invalid').addClass('is-valid');
        } else if (desc.length > 500) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Máximo 500 caracteres');
        } else if (desc.length > 0) {
            $(this).removeClass('is-valid').addClass('is-invalid');
            $(this).siblings('.invalid-feedback').text('Mínimo 10 caracteres');
        } else {
            $(this).removeClass('is-valid is-invalid');
        }
    });

    // ============================================
    // FUNÇÕES DE VALIDAÇÃO EXTERNAS (APIs)
    // ============================================

    // Consultar CNPJ na Receita Federal (via API pública)
    async function consultarCNPJ(cnpj, field) {
        try {
            const cnpjLimpo = cnpj.replace(/\D/g, '');
            
            // Usa nossa API backend que faz a consulta
            const response = await fetch(`/api/cnpj/${cnpjLimpo}`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (!data.valido) {
                    field.removeClass('is-valid').addClass('is-invalid');
                    field.siblings('.invalid-feedback').text(data.mensagem || 'CNPJ inválido');
                    return;
                }
                
                // Auto-preencher nome do estacionamento se vazio
                if ($('#nomeEstacionamento').val() === '' && data.dados.razao_social) {
                    const nomePreferido = data.dados.nome_fantasia || data.dados.razao_social;
                    $('#nomeEstacionamento').val(nomePreferido);
                    $('#nomeEstacionamento').trigger('input');
                }
                
                // NÃO auto-preencher telefone (pode estar desatualizado na Receita Federal)
                // O estabelecimento deve informar o telefone atual de contato
                
                // Auto-preencher email se vazio
                if ($('#registerEmail').val() === '' && data.dados.email) {
                    $('#registerEmail').val(data.dados.email);
                    $('#registerEmail').trigger('blur');
                }
                
                field.removeClass('is-invalid').addClass('is-valid');
                field.siblings('.invalid-feedback').text('');
                
                // Adicionar ícone de verificado
                field.siblings('.verified-badge').remove();
                field.after('<small class="verified-badge text-success ml-2"><i class="fas fa-check-circle"></i> Verificado na Receita Federal</small>');
            } else {
                const errorData = await response.json();
                field.removeClass('is-valid').addClass('is-invalid');
                field.siblings('.invalid-feedback').text(errorData.mensagem || 'CNPJ não encontrado');
            }
        } catch (error) {
            console.log('Erro ao consultar CNPJ:', error);
            // Não bloqueia se API falhar
        }
    }

    // Verificar email real (validação simples no frontend)
    async function verificarEmailReal(email, field) {
        // Validação básica de formato
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            field.removeClass('is-valid').addClass('is-invalid');
            field.siblings('.invalid-feedback').text('Email inválido');
            return;
        }
        
        // Aceita emails válidos (validação de DNS seria muito pesada)
        field.removeClass('is-invalid').addClass('is-valid');
        
        // Adicionar badge verificado para formato válido
        field.siblings('.verified-badge').remove();
        field.after('<small class="verified-badge text-success ml-2"><i class="fas fa-check-circle"></i> Email válido</small>');
    }

    // Validar CPF (para chave PIX)
    function validarCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');
        
        if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
        
        let soma = 0;
        let resto;
        
        for (let i = 1; i <= 9; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
        }
        
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(9, 10))) return false;
        
        soma = 0;
        for (let i = 1; i <= 10; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
        }
        
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(10, 11))) return false;
        
        return true;
    }

    // ============================================
    // FIM DAS MÁSCARAS E VALIDAÇÕES
    // ============================================

    // --- Manipulação de Upload de Imagem ---
    if (fotoEstacionamentoInput) {
        // Atualizar label do arquivo quando selecionado
        fotoEstacionamentoInput.addEventListener('change', function(e) {
            const fileName = e.target.files[0]?.name || 'Escolher arquivo...';
            const label = document.querySelector('.custom-file-label');
            if (label) label.textContent = fileName;
            
            // Validar arquivo
            const file = e.target.files[0];
            if (file) {
                // Validar tamanho (máximo 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    showAdminAlert('admin-form-feedback', 'A imagem deve ter no máximo 5MB.', 'warning');
                    fotoEstacionamentoInput.value = '';
                    if (label) label.textContent = 'Escolher arquivo...';
                    return;
                }
                
                // Validar tipo
                const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    showAdminAlert('admin-form-feedback', 'Formato inválido. Use JPG, PNG ou WEBP.', 'warning');
                    fotoEstacionamentoInput.value = '';
                    if (label) label.textContent = 'Escolher arquivo...';
                    return;
                }
                
                // Mostrar preview
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (imagePreview && imagePreviewContainer) {
                        imagePreview.src = e.target.result;
                        imagePreviewContainer.style.display = 'block';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Remover imagem
        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', function() {
                fotoEstacionamentoInput.value = '';
                const label = document.querySelector('.custom-file-label');
                if (label) label.textContent = 'Escolher arquivo...';
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
                if (imagePreview) imagePreview.src = '';
            });
        }
    }

    // --- Funções de Feedback Visual ---
    const showAdminLoading = (form, isLoading) => {
        const submitButton = form?.querySelector('button[type="submit"]');
        if (!submitButton) return;
        submitButton.disabled = isLoading;
        const spinner = submitButton.querySelector('.spinner-border');
        const icon = submitButton.querySelector('i');
        let defaultText = 'Enviar'; // Padrão

        if (form.id === 'loginForm') defaultText = 'Entrar';
        else if (form.id === 'registerForm') defaultText = 'Registrar';
        else if (form.id === 'forgotPasswordAdminForm') defaultText = 'Enviar Link';

        if (isLoading) {
            if(icon) icon.style.display = 'none';
            if(spinner) spinner.style.display = 'inline-block';
             let textNode = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0);
             if(textNode) { textNode.nodeValue = ' Processando...';} else { submitButton.insertAdjacentText('beforeend', ' Processando...');}
        } else {
            if(icon) icon.style.display = '';
            if(spinner) spinner.style.display = 'none';
            let loadingTextNode = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('Processando'));
            if(loadingTextNode) submitButton.removeChild(loadingTextNode);
            let currentTextContent = Array.from(submitButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE)?.nodeValue?.trim();
            if(!currentTextContent) submitButton.insertAdjacentText(icon ? 'beforeend' : 'afterbegin', ` ${defaultText}`);
        }
    };
    const showAdminAlert = (elementId, message, type = 'danger') => {
        const feedbackElement = document.getElementById(elementId);
        if (feedbackElement) { feedbackElement.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show m-0" role="alert" style="font-size: 0.9rem; padding: .6rem 1rem;">${message}<button type="button" class="close" data-dismiss="alert" aria-label="Close" style="padding: .6rem 1rem;"><span aria-hidden="true">×</span></button></div>`; feedbackElement.style.display = 'block'; }
        else { console.warn(`Alert #${elementId} N/A`); alert(`[${type.toUpperCase()}] ${message}`); }
    };
    const hideAdminAlert = (elementId) => { const fb = document.getElementById(elementId); if (fb) fb.style.display = 'none'; };

    // --- Funções de Validação Frontend ---
    const setErrorFor = (input, message) => { input.classList.add('is-invalid'); const el=input.closest('.form-group').querySelector('.invalid-feedback'); if(el){el.textContent=message; el.style.display='block';} return false; };
    const clearErrorFor = (input) => { input.classList.remove('is-invalid'); const el=input.closest('.form-group').querySelector('.invalid-feedback'); if(el)el.style.display='none'; return true;};
    const validateAdminForm = (form) => {
        let isValid = true; hideAdminAlert('admin-form-feedback');
        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        form.querySelectorAll('.invalid-feedback').forEach(el => el.style.display = 'none');

        // Validação de campos obrigatórios
        form.querySelectorAll('input[required], textarea[required], select[required]').forEach(input => { 
            if (!input.value.trim()) isValid = setErrorFor(input, 'Campo obrigatório.'); 
            else clearErrorFor(input);
        });
        
        // Validação de email
        const emailInput = form.querySelector('input[type="email"][required]'); 
        if (emailInput && emailInput.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) 
            isValid = setErrorFor(emailInput, 'Email inválido.');
            
        // Validação de senha
        const passwordInput = form.querySelector('#registerSenha'); 
        if (passwordInput && passwordInput.value.trim().length < 6) 
            isValid = setErrorFor(passwordInput, 'Senha: Mínimo 6 caracteres.');
            
        // Confirmação de senha
        const confirmInput = form.querySelector('#confirmarSenha'); 
        if (passwordInput && confirmInput && passwordInput.value !== confirmInput.value) 
            isValid = setErrorFor(confirmInput, 'Senhas não coincidem.');
            
        // Validação de vagas
        const vagasInput = form.querySelector('#numeroVagas'); 
        if (vagasInput && (isNaN(parseInt(vagasInput.value)) || parseInt(vagasInput.value) < 0)) 
            isValid = setErrorFor(vagasInput, 'Número de vagas inválido (>=0).');
            
        // Validação de preços
        const precoH = form.querySelector('#precoHora'); 
        if(precoH && (isNaN(parseFloat(precoH.value)) || parseFloat(precoH.value) < 0)) 
            isValid = setErrorFor(precoH, 'Preço inválido (>=0.00).');
            
        const precoD = form.querySelector('#precoDia'); 
        if(precoD && (isNaN(parseFloat(precoD.value)) || parseFloat(precoD.value) < 0)) 
            isValid = setErrorFor(precoD, 'Preço inválido (>=0.00).');
            
        // Validação da chave PIX (apenas CNPJ é aceito)
        const chavePix = form.querySelector('#chavePix');
        const nomeTitularPix = form.querySelector('#nomeTitularPix');
        
        if (chavePix && nomeTitularPix) {
            // Valida CNPJ (apenas dígitos, 14 caracteres)
            if (!chavePix.value.trim()) {
                isValid = setErrorFor(chavePix, 'O CNPJ é obrigatório para recebimento via PIX.');
            } else {
                const cnpj = chavePix.value.replace(/\D/g, '');
                if (cnpj.length !== 14) {
                    isValid = setErrorFor(chavePix, 'CNPJ inválido. Deve conter 14 dígitos.');
                } else {
                    const resultadoCNPJ = validarCNPJ(cnpj);
                    if (!resultadoCNPJ.valido) {
                        isValid = setErrorFor(chavePix, resultadoCNPJ.mensagem || 'CNPJ inválido. Verifique o número digitado.');
                    }
                }
            }
            
            // Valida nome do titular (mínimo 3 caracteres)
            if (!nomeTitularPix.value.trim()) {
                isValid = setErrorFor(nomeTitularPix, 'Nome do titular é obrigatório.');
            } else if (nomeTitularPix.value.trim().length < 3) {
                isValid = setErrorFor(nomeTitularPix, 'Nome do titular deve ter pelo menos 3 caracteres.');
            }
        }
        
        return isValid;
    };

    // --- Funções de Interface (Login/Register Toggle) ---
    function showLoginForm() { if(loginForm) loginForm.style.display = 'block'; if(registerForm) registerForm.style.display = 'none'; btnLogin?.classList.add('active'); btnRegister?.classList.remove('active'); hideAdminAlert('admin-form-feedback');}
    function showRegisterForm() { if(loginForm) loginForm.style.display = 'none'; if(registerForm) registerForm.style.display = 'block'; btnLogin?.classList.remove('active'); btnRegister?.classList.add('active'); hideAdminAlert('admin-form-feedback');}
    function showSuccessPopup() { successPopup.modal('show'); }
    function closePopup() { successPopup.modal('hide'); }

    // --- Manipuladores de Eventos ---

    // LOGIN ADMIN
    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); hideAdminAlert('admin-form-feedback');
        if (!validateAdminForm(loginForm)) return; showAdminLoading(loginForm, true);
        const email = document.getElementById('loginEmail').value; const senha = document.getElementById('loginSenha').value;
        try {
          const response = await fetch('/api/auth/admin/login', { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, senha}) });
          const data = await response.json(); if (!response.ok) throw new Error(data.message || `Erro ${response.status}`);
          if (data.status === 'success' && data.accessToken) {
            localStorage.setItem('adminAuthToken', data.accessToken); // Salva Access Token Admin
            window.location.href = '/admin_home/admin/home.html'; // Vai para dashboard admin
          } else { throw new Error(data.message || 'Resposta inválida.'); }
        } catch (error) { showAdminAlert('admin-form-feedback', `Erro: ${error.message}`, 'danger');
        } finally { showAdminLoading(loginForm, false); }
      });
    }

    // CADASTRO ADMIN + ESTACIONAMENTO
    const submitRegistrationBtn = document.getElementById('submitRegistration');
    if (submitRegistrationBtn) {
      // Helper: POST JSON com timeout e retry
      const postJsonWithTimeoutAndRetry = async (url, bodyObj, opts) => {
        const { timeoutMs = 20000, retries = 1 } = opts || {};
        let lastError;
        for (let attempt = 0; attempt <= retries; attempt++) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(bodyObj),
              credentials: 'same-origin',
              signal: controller.signal
            });
            clearTimeout(timer);
            return resp;
          } catch (err) {
            clearTimeout(timer);
            lastError = err;
            // Tenta novamente apenas em erros de rede/timeout
            const isAbort = err && (err.name === 'AbortError');
            const isNetwork = err && (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')));
            if (attempt < retries && (isAbort || isNetwork)) {
              await new Promise(r => setTimeout(r, 800));
              continue;
            }
            throw err;
          }
        }
        throw lastError || new Error('Falha desconhecida');
      };
      submitRegistrationBtn.addEventListener('click', async () => {
        hideAdminAlert('admin-form-feedback');
        
        // Validação de senhas
        const senha = document.getElementById('registerSenha')?.value; 
        const confirmarSenha = document.getElementById('confirmarSenha')?.value;
        
        if (!senha || !confirmarSenha || senha !== confirmarSenha) { 
            const confirmarSenhaEl = document.getElementById('confirmarSenha');
            if (confirmarSenhaEl) {
                confirmarSenhaEl.classList.add('is-invalid');
                const errorElement = confirmarSenhaEl.closest('.form-group')?.querySelector('.invalid-feedback');
                if (errorElement) {
                    errorElement.textContent = 'As senhas não coincidem.';
                }
            }
            return; 
        }
        
        const registerForm = document.getElementById('registerForm');
        if (!validateAdminForm(registerForm)) return;
        
        // Mostrar loading
        const spinner = submitRegistrationBtn.querySelector('.spinner-border');
        if (spinner) spinner.style.display = 'inline-block';
        submitRegistrationBtn.disabled = true;

        try {
            // Coletando dados do formulário manualmente
            const dadosSolicitacao = {};
            const formElements = document.querySelectorAll('#registerForm input, #registerForm select, #registerForm textarea');
            
            formElements.forEach(element => {
                if (element.name && element.type !== 'file') {
                    dadosSolicitacao[element.name] = element.value;
                }
            });
            
            // Processar foto do estacionamento se houver
            const fotoInput = document.getElementById('fotoEstacionamento');
            if (fotoInput && fotoInput.files.length > 0) {
                const file = fotoInput.files[0];
                // Converter imagem para base64
                const base64Image = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                dadosSolicitacao.fotoEstacionamento = base64Image;
                dadosSolicitacao.fotoEstacionamentoNome = file.name;
            }
            
            console.log('Enviando registro de admin:', { ...dadosSolicitacao, fotoEstacionamento: dadosSolicitacao.fotoEstacionamento ? '[IMAGEM]' : 'sem foto' });
            
            // Enviando para o endpoint de registro de admin
            const response = await postJsonWithTimeoutAndRetry('/api/auth/admin/register', dadosSolicitacao, { timeoutMs: 25000, retries: 1 });
            
            console.log('Resposta do servidor:', response.status);
            
            // Verifica se a resposta é JSON
            const contentType = response.headers.get('content-type');
            let data = {};
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
                console.log('Dados da resposta:', data);
                
                if (!response.ok) {
                    if (response.status === 422 && data.errors) { 
                        const msg = data.errors.map(e => `${e.param}: ${e.msg}`).join('\n'); 
                        throw new Error(msg);
                    }
                    throw new Error(data.message || `Erro ${response.status} ao processar a solicitação`);
                }
                
                // Mostrar mensagem de sucesso
                showSuccessPopup();
                registerForm.reset();
                
                // Redireciona para a página de login após 2 segundos
                setTimeout(() => { 
                    closePopup(); 
                    showLoginForm(); 
                }, 2000);
            } else {
                const text = await response.text();
                console.log('Resposta não-JSON:', text);
                throw new Error('Resposta inválida do servidor');
            }
        } catch (error) {
            console.error('Erro ao enviar solicitação:', error);
            const friendly = (error && (error.name === 'AbortError' || (error.message && error.message.includes('Failed to fetch'))))
              ? 'Falha de conexão ao enviar a solicitação. Verifique sua internet e tente novamente.'
              : (error && error.message) || 'Erro ao enviar solicitação.';
            showAdminAlert('admin-form-feedback', `Erro: ${friendly}`, 'danger');
        } finally {
            // Esconder spinner e reativar botão
            if (spinner) spinner.style.display = 'none';
            submitRegistrationBtn.disabled = false;
        }
      });
    }

    // ESQUECI SENHA ADMIN
    if (forgotPasswordAdminForm) {
        forgotPasswordAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault(); hideAdminAlert('forgot-admin-feedback');
            const emailInput = document.getElementById('forgotAdminEmail');
            clearErrorFor(emailInput); // Limpa erro anterior
            if (!emailInput.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) { setErrorFor(emailInput, 'Insira um email válido.'); return; }
            showAdminLoading(forgotPasswordAdminForm, true);
            try {
                // Usa o mesmo endpoint de usuário, o backend diferencia
                const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput.value }) });
                const result = await response.json(); if (!response.ok) throw new Error(result.message || `Erro ${response.status}`);
                showAdminAlert('forgot-admin-feedback', result.message, 'info'); // Mostra msg da API
            } catch (error) { showAdminAlert('forgot-admin-feedback', `Erro: ${error.message}`, 'danger');
            } finally { showAdminLoading(forgotPasswordAdminForm, false); }
        });
    }

    // Scroll Effect (Mantido)
    window.addEventListener('scroll', () => { document.body.classList.toggle('scrolling', window.scrollY > 0); });
    // Mostrar Login por Padrão
    if(loginForm) showLoginForm(); // Garante que login seja exibido ao carregar

    // Função para validar CNPJ
    const validarCNPJ = (cnpj) => {
        // Validação básica do formato
        cnpj = cnpj.replace(/[^\d]+/g,'');
        
        if (cnpj === '') return { valido: false, mensagem: 'CNPJ é obrigatório' };
        if (cnpj.length !== 14) return { valido: false, mensagem: 'CNPJ deve ter 14 dígitos' };
        
        // Elimina CNPJs invalidos conhecidos
        if (/^(\d)\1+$/.test(cnpj)) return { valido: false, mensagem: 'CNPJ inválido' };

        // Valida DVs
        let tamanho = cnpj.length - 2;
        let numeros = cnpj.substring(0, tamanho);
        const digitos = cnpj.substring(tamanho);
        let soma = 0;
        let pos = tamanho - 7;
        
        for (let i = tamanho; i >= 1; i--) {
            soma += numeros.charAt(tamanho - i) * pos--;
            if (pos < 2) pos = 9;
        }
        
        let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(0)) return { valido: false, mensagem: 'CNPJ inválido' };
        
        tamanho = tamanho + 1;
        numeros = cnpj.substring(0, tamanho);
        soma = 0;
        pos = tamanho - 7;
        
        for (let i = tamanho; i >= 1; i--) {
            soma += numeros.charAt(tamanho - i) * pos--;
            if (pos < 2) pos = 9;
        }
        
        resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(1)) return { valido: false, mensagem: 'CNPJ inválido' };
        
        // Se passou por todas as validações, retorna válido
        return { 
            valido: true, 
            mensagem: 'CNPJ válido' 
        };
    }
    
    // Função auxiliar para mostrar feedback de e-mail
    function _showEmailFeedback(input, message, type = 'info') {
        const emailGroup = input.closest('.form-group');
        let feedback = emailGroup.querySelector('.email-feedback');
        
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'email-feedback mt-1 small';
            emailGroup.appendChild(feedback);
        }
        
        // Remove classes de tipo anteriores
        feedback.className = 'email-feedback mt-1 small';
        
        // Adiciona classes e estilos com base no tipo
        if (type === 'valid') {
            input.classList.add('is-valid');
            feedback.classList.add('text-success');
        } else if (type === 'invalid') {
            input.classList.add('is-invalid');
            feedback.classList.add('text-danger');
        } else if (type === 'warning') {
            feedback.classList.add('text-warning');
        } else {
            feedback.classList.add('text-info');
        }
        
        feedback.textContent = message;
    }

    // Formatação de CNPJ e validação
    if (cnpjInput) {
        // Formata o CNPJ enquanto digita
        cnpjInput.addEventListener('input', (e) => {
            const formattedCNPJ = formatarCNPJ(e.target.value);
            e.target.value = formattedCNPJ;
        });

        // Valida o CNPJ quando sai do campo
        cnpjInput.addEventListener('blur', async (e) => {
            const cnpj = e.target.value.replace(/\D/g, '');
            if (cnpj.length === 14) {
                const resultado = validarCNPJ(cnpj);
                const feedbackElement = cnpjInput.closest('.form-group').querySelector('.invalid-feedback');
                
                if (resultado.valido) {
                    cnpjInput.classList.remove('is-invalid');
                    cnpjInput.classList.add('is-valid');
                    feedbackElement.style.display = 'none';
                    
                    // Preenche automaticamente a chave PIX com o CNPJ
                    const chavePixInput = document.getElementById('chavePix');
                    if (chavePixInput && !chavePixInput.value) {
                        chavePixInput.value = formatarCNPJ(cnpj);
                        chavePixInput.dispatchEvent(new Event('input'));
                    }
                } else {
                    cnpjInput.classList.remove('is-valid');
                    cnpjInput.classList.add('is-invalid');
                    feedbackElement.textContent = resultado.mensagem || 'CNPJ inválido';
                    feedbackElement.style.display = 'block';
                }
            }
        });
    }
    
    // Função para formatar CNPJ
    const formatarCNPJ = (cnpj) => {
        cnpj = cnpj.replace(/\D/g, '');
        if (cnpj.length > 14) cnpj = cnpj.substring(0, 14);
        
        if (cnpj.length > 12) {
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        } else if (cnpj.length > 8) {
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        } else if (cnpj.length > 5) {
            cnpj = cnpj.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else if (cnpj.length > 2) {
            cnpj = cnpj.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
        }
        
        return cnpj;
    };
    

    
    // Ativa botões de alternância
    if(btnLogin) btnLogin.addEventListener('click', showLoginForm);
    if(btnRegister) btnRegister.addEventListener('click', showRegisterForm);
    
    // Handle forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            $('#forgotPasswordModal').modal('show');
        });
    }
    
        // --- Funcionalidade de Busca de CEP ---
    
    // Função para buscar CEP usando o endpoint da API local
    const buscarCep = async () => {
        const cep = cepInput?.value.replace(/\D/g, '');
        
        if (cep.length !== 8) {
            return; // Retorna se o CEP não estiver completo
        }
        
        try {
            // Usa o endpoint local como proxy
            const response = await fetch(`/api/utils/buscar-cep/${cep}`);
            
            if (!response.ok) {
                throw new Error(`Erro ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.erro) {
                throw new Error('CEP não encontrado');
            }
            
            // Garante que os campos estejam no formato esperado
            const endereco = {
                logradouro: data.logradouro || '',
                bairro: data.bairro || '',
                localidade: data.localidade || data.cidade || '',
                uf: data.uf || data.estado || '',
                cep: data.cep || cep
            };
            
            preencherEndereco(endereco);
            
        } catch (error) {
            console.error('Erro ao buscar CEP:', error);
        }
    };
    
    // Removido o evento de clique ao botão de buscar CEP pois ele foi removido do HTML
    
    // Função para formatar CEP
    const formatarCep = (cep) => {
        cep = cep.replace(/\D/g, '');
        cep = cep.replace(/(\d{5})(\d)/, '$1-$2');
        return cep;
    };

    // Função para preencher os campos de endereço com os dados do CEP
    const preencherEndereco = (data) => {
        const logradouro = document.getElementById('logradouroEstacionamento');
        const bairro = document.getElementById('bairroEstacionamento');
        const cidade = document.getElementById('cidadeEstacionamento');
        const uf = document.getElementById('ufEstacionamento');

        if (logradouro) logradouro.value = data.logradouro || '';
        if (bairro) bairro.value = data.bairro || '';
        if (cidade) cidade.value = data.localidade || '';
        if (uf) uf.value = data.uf || '';

        // Atualiza o endereço completo após preencher os campos
        atualizarEnderecoCompleto();
    };

    // Função para atualizar o endereço completo e calcular coordenadas
    const atualizarEnderecoCompleto = async () => {
        const logradouro = document.getElementById('logradouroEstacionamento')?.value.trim() || '';
        const numero = document.getElementById('numeroEstacionamento')?.value.trim() || '';
        const complemento = document.getElementById('complementoEstacionamento')?.value.trim() || '';
        const bairro = document.getElementById('bairroEstacionamento')?.value.trim() || '';
        const cidade = document.getElementById('cidadeEstacionamento')?.value.trim() || '';
        const uf = document.getElementById('ufEstacionamento')?.value.trim() || '';
        const cep = cepInput?.value.replace(/\D/g, '') || '';

        // Formata o endereço completo para exibição
        const partesEndereco = [
            logradouro && numero ? `${logradouro}, ${numero}` : logradouro || '',
            complemento ? complemento : '',
            bairro ? `Bairro: ${bairro}` : '',
            cidade ? `${cidade} - ${uf}` : '',
            cep ? `CEP: ${cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''
        ].filter(Boolean);

        const enderecoCompleto = partesEndereco.join(' | ');
        
        const enderecoEstacionamentoInput = document.getElementById('enderecoEstacionamento');
        if (enderecoEstacionamentoInput) {
            enderecoEstacionamentoInput.value = enderecoCompleto;
        }

        // Se todos os campos necessários estiverem preenchidos, calcula as coordenadas com máxima precisão
        if (logradouro && numero && bairro && cidade && uf) {
            await calcularCoordenadasPrecisas({
                logradouro,
                numero,
                complemento,
                bairro,
                cidade,
                uf,
                cep
            });
        }
    };

    // Função para calcular coordenadas com MÁXIMA PRECISÃO usando endereço estruturado
    const calcularCoordenadasPrecisas = async (dadosEndereco) => {
        try {
            console.log('🎯 Calculando coordenadas com precisão...', dadosEndereco);
            
            // Mostra indicador de carregamento
            const latInput = document.getElementById('latitude');
            const lngInput = document.getElementById('longitude');
            
            if (latInput) latInput.value = 'Calculando...';
            if (lngInput) lngInput.value = 'Calculando...';
            
            // Chama API de geocodificação precisa
            const response = await fetch('/api/utils/geocodificar-preciso', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosEndereco)
            });
            
            if (!response.ok) {
                throw new Error('Erro ao calcular coordenadas');
            }
            
            const result = await response.json();
            
            if (result.status === 'success' && result.data) {
                const { latitude, longitude, qualityScore, confidence, precisao, consenso, distanciaMediaConsenso, fonte, type: _type } = result.data;
                
                console.log('✅ Coordenadas 100% PRECISAS calculadas:', {
                    latitude,
                    longitude,
                    qualityScore,
                    confidence,
                    precisao,
                    consenso,
                    distanciaMediaConsenso,
                    fonte,
                    message: result.message
                });
                
                // Preenche os campos com as coordenadas ultra precisas
                if (latInput) {
                    latInput.value = latitude;
                    latInput.classList.remove('is-invalid');
                    latInput.classList.add('is-valid');
                }
                
                if (lngInput) {
                    lngInput.value = longitude;
                    lngInput.classList.remove('is-invalid');
                    lngInput.classList.add('is-valid');
                }
                
                // Determina ícone e cor baseado na precisão
                let icone, _cor, cssClass, badgeText;
                if (precisao.includes('100%') || precisao.includes('PERFEITA')) {
                    icone = 'check-double';
                    _cor = '#28a745';
                    cssClass = 'success';
                    badgeText = '🎯 Precisão Perfeita (100%)';
                } else if (precisao.includes('95%') || precisao.includes('MUITO ALTA')) {
                    icone = 'check-circle';
                    _cor = '#20c997';
                    cssClass = 'success';
                    badgeText = '🎯 Precisão Muito Alta (95%)';
                } else if (precisao.includes('85%') || precisao.includes('ALTA')) {
                    icone = 'check-circle';
                    _cor = '#17a2b8';
                    cssClass = 'info';
                    badgeText = '✅ Precisão Alta (85%)';
                } else if (precisao.includes('70%') || precisao.includes('BOA')) {
                    icone = 'exclamation-circle';
                    _cor = '#ffc107';
                    cssClass = 'warning';
                    badgeText = '⚠️ Precisão Boa (70%)';
                } else {
                    icone = 'info-circle';
                    _cor = '#fd7e14';
                    cssClass = 'warning';
                    badgeText = 'ℹ️ Precisão Moderada (50%)';
                }
                
                // Mostra badge de qualidade com detalhes completos
                const feedbackQualidade = `
                    <div class="alert alert-${cssClass} py-2 px-3 mb-0" style="font-size: 0.85rem;">
                        <strong><i class="fas fa-${icone}"></i> ${badgeText}</strong><br>
                        <small>
                            📊 Score: ${qualityScore.toFixed(2)}/20 | 
                            🔍 Consenso: ${consenso}/3 APIs | 
                            📏 Margem: ±${distanciaMediaConsenso}m | 
                            🌐 Fonte: ${fonte}
                        </small>
                    </div>
                `;
                
                // Remove feedback anterior
                $('.coords-quality-badge').remove();
                
                // Adiciona novo feedback
                if (lngInput) {
                    $(lngInput).after(`<div class="coords-quality-badge mt-2">${feedbackQualidade}</div>`);
                }
                
            } else {
                throw new Error(result.message || 'Erro ao geocodificar');
            }
            
        } catch (error) {
            console.error('❌ Erro ao calcular coordenadas:', error);
            
            const latInput = document.getElementById('latitude');
            const lngInput = document.getElementById('longitude');
            
            if (latInput) {
                latInput.value = '';
                latInput.classList.remove('is-valid');
            }
            if (lngInput) {
                lngInput.value = '';
                lngInput.classList.remove('is-valid');
            }
            
            // Mostra mensagem de erro
            $('.coords-quality-badge').remove();
            if (lngInput) {
                $(lngInput).after('<div class="coords-quality-badge mt-1"><small class="text-danger"><i class="fas fa-times-circle"></i> Não foi possível calcular as coordenadas. Verifique o endereço.</small></div>');
            }
        }
    };

    // Função para calcular coordenadas usando o endpoint local
    const _calcularCoordenadas = async (enderecoForcado = null) => {
        try {
            let enderecoFormatado = enderecoForcado;
            
            if (!enderecoForcado) {
                // Obtém os valores dos campos primeiro para usar no fallback se necessário
                const camposEndereco = {
                    logradouro: document.getElementById('logradouroEstacionamento')?.value.trim() || '',
                    numero: document.getElementById('numeroEstacionamento')?.value.trim() || '',
                    bairro: document.getElementById('bairroEstacionamento')?.value.trim() || '',
                    cidade: document.getElementById('cidadeEstacionamento')?.value.trim() || '',
                    uf: document.getElementById('ufEstacionamento')?.value.trim() || ''
                };
                
                try {
                    // Tenta carregar o módulo de análise de endereços
                    const response = await fetch('/api/utils/parse-address', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...camposEndereco,
                            cep: document.getElementById('cepEstacionamento')?.value.trim() || ''
                        })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === 'success' && data.variacoes) {
                            enderecoFormatado = data.variacoes;
                            console.log('Variações de endereço geradas pelo servidor:', enderecoFormatado);
                        } else {
                            throw new Error(data.message || 'Erro ao processar endereço');
                        }
                    } else {
                        throw new Error('Erro na requisição ao servidor');
                    }
                    
                } catch (error) {
                    console.error('Erro ao processar endereço, usando fallback:', error);
                    // Fallback para um método mais simples
                    enderecoFormatado = [
                        `${camposEndereco.logradouro}, ${camposEndereco.numero}, ${camposEndereco.bairro}, ${camposEndereco.cidade} - ${camposEndereco.uf}`,
                        `${camposEndereco.logradouro}, ${camposEndereco.numero}, ${camposEndereco.cidade} - ${camposEndereco.uf}`,
                        `${camposEndereco.logradouro} ${camposEndereco.numero}, ${camposEndereco.cidade} - ${camposEndereco.uf}`
                    ].filter(addr => addr && addr.trim().length > 0);
                }
            }

            console.log('Buscando coordenadas para:', enderecoFormatado);
            
            // Usa o endpoint local como proxy para o OpenCage
            const response = await fetch('/api/utils/geocodificar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ endereco: enderecoFormatado })
            });
            
            if (!response.ok) {
                throw new Error(`Erro na requisição: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status === 'success' && data.data) {
                let { latitude, longitude, confidence, formatted } = data.data;
                
                // Função para formatar coordenada com precisão otimizada
                const formatCoord = (coord) => {
                    // Converte para número e garante que é um número válido
                    const num = parseFloat(coord);
                    if (isNaN(num)) return '0.000000000000000'; // Retorna zero se não for número
                    
                    // Formata com 15 casas decimais (precisão de frações de micrômetro)
                    // Usa o método toFixed para garantir o número exato de casas
                    return num.toFixed(15);
                };
                
                // Formata as coordenadas
                const latFormatted = formatCoord(latitude);
                const lngFormatted = formatCoord(longitude);
                
                console.log('Resposta da API:', {
                    coordenadas: { 
                        latitude: latFormatted, 
                        longitude: lngFormatted 
                    },
                    confianca: confidence,
                    enderecoFormatado: formatted,
                    raw_data: data.data // Inclui todos os dados retornados para debug
                });
                
                const latInput = document.getElementById('latitude');
                const lonInput = document.getElementById('longitude');
                
                // Define os valores formatados nos campos
                if (latInput) latInput.value = latFormatted;
                if (lonInput) lonInput.value = lngFormatted;
                
                // Se a confiança for baixa, loga um aviso
                if (confidence < 0.7) {
                    console.warn('Baixa confiança nas coordenadas encontradas:', confidence);
                }
                
                return { latitude, longitude };
            } else {
                console.warn('Nenhum resultado encontrado para o endereço:', enderecoFormatado);
                return null;
            }
        } catch (error) {
            console.error('Erro ao calcular coordenadas:', error);
            return null;
        }
    };

    // Adiciona evento de formatação e busca automática ao campo de CEP
    if (cepInput) {
        cepInput.addEventListener('input', (e) => {
            e.target.value = formatarCep(e.target.value);
            
            // Verifica se o CEP tem 8 dígitos (sem contar o hífen)
            const cepDigits = e.target.value.replace(/\D/g, '');
            if (cepDigits.length === 8) {
                // Busca o CEP automaticamente quando completo
                buscarCep();
            }
        });
        
        // Busca CEP ao perder o foco do campo
        cepInput.addEventListener('blur', () => {
            const cepDigits = cepInput.value.replace(/\D/g, '');
            if (cepDigits.length === 8) {
                buscarCep();
            }
        });
    }

    // Atualiza endereço completo e recalcula coordenadas quando QUALQUER campo de endereço mudar
    const camposEndereco = [
        'logradouroEstacionamento',
        'numeroEstacionamento',
        'complementoEstacionamento',
        'bairroEstacionamento',
        'cidadeEstacionamento',
        'ufEstacionamento'
    ];

    // Debounce para evitar múltiplas chamadas
    let timeoutEndereco = null;
    
    camposEndereco.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
            // Atualiza ao perder foco (blur)
            campo.addEventListener('blur', () => {
                clearTimeout(timeoutEndereco);
                timeoutEndereco = setTimeout(() => {
                    atualizarEnderecoCompleto();
                }, 300);
            });
            
            // Atualiza também quando tecla Enter for pressionada
            campo.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(timeoutEndereco);
                    atualizarEnderecoCompleto();
                }
            });
        }
    });

    // Botão manual para recalcular coordenadas (se existir)
    const btnRecalcularCoords = document.getElementById('btnRecalcularCoords');
    if (btnRecalcularCoords) {
        btnRecalcularCoords.addEventListener('click', () => {
            atualizarEnderecoCompleto();
        });
    }

    // Scroll Effect (Mantido)
    window.addEventListener('scroll', () => { 
        document.body.classList.toggle('scrolling', window.scrollY > 0); 
    });

    // Mostrar Login por Padrão
    if(loginForm) showLoginForm(); // Garante que login seja exibido ao carregar
}); // Fim DOMContentLoaded