/**
 * appUtils.js
 * Utilitários globais para a aplicação ParkNow
 * 
 * Este arquivo contém funções utilitárias compartilhadas em toda a aplicação,
 * como inicialização de serviços, helpers de autenticação, e utilidades gerais.
 */

// Função para inicializar serviços da aplicação
function initializeAppServices() {
    // Inicializa o serviço de notificações automaticamente em todas as páginas
    if (window.notificationService) {
        // Tenta obter credenciais do usuário do localStorage
        const userId = localStorage.getItem('userId');
        const authToken = localStorage.getItem('authToken');
        
        // Inicializa o serviço com as credenciais disponíveis
        window.notificationService.init({
            userId: userId,
            token: authToken,
            soundEnabled: localStorage.getItem('notificationSoundEnabled') !== 'false'
        });
    } else {
        console.warn('[AppUtils] Serviço de notificações não disponível.');
    }
    
    // Inicializa o mecanismo de renovação automática de token
    if (localStorage.getItem('userId') && localStorage.getItem('authToken')) {
        setupTokenRefresh();
    }
}

// Configura o mecanismo de renovação automática de token
function setupTokenRefresh() {
    // Decodifica o token atual para verificar quando ele expira
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    try {
        // Decodifica o token JWT para obter o tempo de expiração
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) return;
        
        const payload = JSON.parse(atob(tokenParts[1]));
        if (!payload.exp) return;
        
        // Calcula quando o token expira (em milissegundos)
        const expirationTime = payload.exp * 1000; // Converte de segundos para milissegundos
        const currentTime = Date.now();
        
        // Calcula o tempo até a expiração
        const timeUntilExpiration = expirationTime - currentTime;
        
        // Se o token já expirou ou está prestes a expirar, renova imediatamente
        if (timeUntilExpiration < 60000) { // Menos de 1 minuto
            refreshAccessToken();
            return;
        }
        
        // Programa a renovação para 1 minuto antes da expiração
        const refreshTime = timeUntilExpiration - 60000; // 1 minuto antes
        console.log(`[TokenRefresh] Token expira em ${Math.round(timeUntilExpiration/1000)}s. Renovação programada para ${Math.round(refreshTime/1000)}s.`);
        
        // Limpa qualquer temporizador existente
        if (window.tokenRefreshTimeout) {
            clearTimeout(window.tokenRefreshTimeout);
        }
        
        // Configura o novo temporizador
        window.tokenRefreshTimeout = setTimeout(() => {
            refreshAccessToken();
        }, refreshTime);
    } catch (error) {
        console.error('[TokenRefresh] Erro ao decodificar token:', error);
        // Em caso de erro, tenta renovar o token de qualquer forma
        refreshAccessToken();
    }
}

// Função para renovar o token de acesso
async function refreshAccessToken() {
    console.log('[TokenRefresh] Iniciando renovação do token...');
    
    try {
        // Adiciona timestamp para evitar cache
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/auth/refresh-token?_=${timestamp}`, {
            method: 'POST',
            credentials: 'include', // Inclui cookies
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[TokenRefresh] Erro na renovação do token: ${response.status}`, errorText);
            
            // Se o erro for 401 (Unauthorized), o refresh token pode ter expirado
            if (response.status === 401) {
                console.warn('[TokenRefresh] Refresh token expirado ou inválido. Redirecionando para login...');
                // Limpa dados de autenticação
                localStorage.removeItem('authToken');
                localStorage.removeItem('userId');
                
                // Redireciona para login após um pequeno delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
                return;
            }
            
            throw new Error(`Erro na renovação do token: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.accessToken) {
            console.log('[TokenRefresh] Token renovado com sucesso!');
            localStorage.setItem('authToken', data.accessToken);
            
            // Atualiza o token no serviço de notificações, se disponível
            if (window.notificationService) {
                window.notificationService.token = data.accessToken;
            }
            
            // Configura a próxima renovação
            setupTokenRefresh();
            
            // Dispara evento de token renovado
            document.dispatchEvent(new CustomEvent('auth:token-refreshed', {
                detail: { token: data.accessToken }
            }));
            
            return true; // Indica sucesso
        } else {
            console.error('[TokenRefresh] Resposta sem token:', data);
            return false;
        }
    } catch (error) {
        console.error('[TokenRefresh] Falha na renovação do token:', error);
        
        // Se falhar, tenta novamente em 30 segundos, a menos que o usuário já tenha sido redirecionado
        if (localStorage.getItem('authToken')) {
            setTimeout(() => {
                refreshAccessToken();
            }, 30000);
        }
        
        return false;
    }
}

// Utilitários de autenticação
const AuthUtils = {
    // Verifica se o usuário está logado
    isLoggedIn: function() {
        return !!localStorage.getItem('authToken');
    },
    
    // Obtém o token de autenticação
    getToken: function() {
        return localStorage.getItem('authToken');
    },
    
    // Obtém o ID do usuário
    getUserId: function() {
        return localStorage.getItem('userId');
    },
    
    // Faz logout (pode ser chamado de qualquer página)
    logout: function() {
        // Limpa localStorage
        localStorage.removeItem('authToken');
        localStorage.removeItem('userId');
        
        // Dispara evento de logout para os serviços
        document.dispatchEvent(new Event('auth:logout'));
        
        // Faz chamada à API para garantir logout no servidor
        fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include' // Inclui cookies
        }).catch(err => console.error('Erro no logout:', err));
        
        // Redireciona para página inicial
        window.location.href = '/';
    }
};

// Inicializa serviços quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    initializeAppServices();
});

// Verifica se tem cookie de autenticação e não tem no localStorage
// Isso pode acontecer se o usuário vier de outra aba ou em situações especiais
function checkForAuthCookies() {
    // Se já temos credenciais no localStorage, não precisamos verificar cookies
    if (localStorage.getItem('userId') && localStorage.getItem('authToken')) {
        return;
    }
    
    // Verifica se temos cookie de autenticação
    const cookies = document.cookie.split(';').reduce((cookies, cookie) => {
        const [name, value] = cookie.trim().split('=').map(c => c.trim());
        cookies[name] = value;
        return cookies;
    }, {});
    
    // Se temos um cookie de autenticação mas não temos no localStorage
    if (cookies.authToken && !localStorage.getItem('authToken')) {
        console.log('[AppUtils] Encontrado token no cookie, mas não no localStorage.');
        localStorage.setItem('authToken', cookies.authToken);
        
        // Tenta decodificar o JWT para extrair o userId
        try {
            const tokenParts = cookies.authToken.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                if (payload.id) {
                    localStorage.setItem('userId', payload.id.toString());
                    console.log(`[AppUtils] Extraído userId ${payload.id} do token JWT.`);
                    
                    // Reinicializa serviços com novas credenciais
                    initializeAppServices();
                }
            }
        } catch (error) {
            console.warn('[AppUtils] Erro ao decodificar token JWT', error);
        }
    }
}

// Verifica cookies de autenticação logo ao carregar
checkForAuthCookies();

// Exporta utilidades para uso global
window.AuthUtils = AuthUtils;
window.initializeAppServices = initializeAppServices;
window.refreshAccessToken = refreshAccessToken;
window.setupTokenRefresh = setupTokenRefresh;
