// public/admin_home/admin-validators.js
// Validadores/formatadores PUROS do cadastro de admin, extraídos do script.js
// (god file). Carregado ANTES de script.js — expõe funções no escopo global.
// Sem DOM, sem estado: testáveis isoladamente.

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

const formatarCep = (cep) => {
        cep = cep.replace(/\D/g, '');
        cep = cep.replace(/(\d{5})(\d)/, '$1-$2');
        return cep;
    };
