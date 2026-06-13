/**
 * notificationService.js
 * Sistema centralizado de notificações em tempo real para o ParkNow
 * Este serviço gerencia a conexão com Socket.IO e as notificações para todas as páginas
 */

// Classe principal para gerenciar notificações
// Logs de depuracao desativados por padrao; ligue com localStorage.setItem('parknow_debug','1')
window.PARKNOW_DEBUG = (typeof window.PARKNOW_DEBUG !== 'undefined')
    ? window.PARKNOW_DEBUG
    : (() => { try { return localStorage.getItem('parknow_debug') === '1'; } catch (_e) { return false; } })();
function debugLog(...args) { if (window.PARKNOW_DEBUG) console.log(...args); }

class NotificationService {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.userId = null;
        this.token = null;
        this.notificationQueue = [];
        this.maxQueueSize = 50;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000; // 5 segundos
        this.listeners = {};
        this.notificationContainer = null;
        this.soundEnabled = true;
        this.notificationSound = null;
        this.initialized = false;
    }

    /**
     * Inicializa o serviço de notificações
     * @param {Object} options - Opções de configuração
     * @param {string} options.userId - ID do usuário atual
     * @param {string} options.token - Token JWT de autenticação
     * @param {boolean} options.soundEnabled - Se o som de notificação está habilitado
     * @param {string} options.containerSelector - Seletor CSS para o container de notificações
     */
    init(options = {}) {
        if (this.initialized) return;
        
        // Configurações
        this.userId = options.userId || null;
        this.token = options.token || null;
        this.soundEnabled = options.soundEnabled !== undefined ? options.soundEnabled : true;
        
        // Cria ou localiza o container de notificações
        const containerSelector = options.containerSelector || '#notificationContainer';
        this.notificationContainer = document.querySelector(containerSelector);
        
        if (!this.notificationContainer) {
            // Cria o container se não existir
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notificationContainer';
            this.notificationContainer.className = 'notification-container';
            document.body.appendChild(this.notificationContainer);
            
            // Adiciona estilos se necessário
            if (!document.getElementById('notificationStyles')) {
                const style = document.createElement('style');
                style.id = 'notificationStyles';
                style.textContent = this.getDefaultStyles();
                document.head.appendChild(style);
            }
        }
        
        // Inicializa o som de notificação
        this.initNotificationSound();
        
        // Primeiramente tenta obter credenciais das opções passadas
        if (options.userId && options.token) {
            this.userId = options.userId;
            this.token = options.token;
            // Armazena as credenciais no localStorage para uso futuro
            localStorage.setItem('userId', this.userId);
            localStorage.setItem('authToken', this.token);
        } 
        // Se não tiver credenciais nas opções, tenta recuperar do localStorage
        else {
            const storedUserId = localStorage.getItem('userId');
            const storedToken = localStorage.getItem('authToken');
            
            if (storedUserId && storedToken) {
                this.userId = storedUserId;
                this.token = storedToken;
                
                // Verifica se o token precisa ser renovado
                if (window.setupTokenRefresh) {
                    window.setupTokenRefresh();
                }
            } 
            // Tenta obter as credenciais do cookie, se disponível
            else {
                const cookies = document.cookie.split(';').reduce((cookies, cookie) => {
                    const [name, value] = cookie.trim().split('=').map(c => c.trim());
                    cookies[name] = value;
                    return cookies;
                }, {});
                
                if (cookies.authToken) {
                    this.token = cookies.authToken;
                    
                    // Tenta extrair userId do token JWT
                    try {
                        const tokenParts = this.token.split('.');
                        if (tokenParts.length === 3) {
                            const payload = JSON.parse(atob(tokenParts[1]));
                            if (payload.id) {
                                this.userId = payload.id.toString();
                                localStorage.setItem('userId', this.userId);
                                localStorage.setItem('authToken', this.token);
                                
                                // Verifica se o token precisa ser renovado
                                if (window.setupTokenRefresh) {
                                    window.setupTokenRefresh();
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('[NotificationService] Erro ao decodificar token JWT', error);
                    }
                }
            }
        }
        
        // Carrega notificações do armazenamento local
        this.loadNotificationsFromStorage();
        
        // Tenta conectar se tiver credenciais
        if (this.userId && this.token) {
            this.connect();
        }
        
        // Configura verificador de credenciais para conectar automaticamente
        this.setupCredentialCheck();
        
        this.initialized = true;
    }

    /**
     * Configura verificador periódico de credenciais para conexão automática
     */
    setupCredentialCheck() {
        // Verifica a cada 5 segundos se credenciais estão disponíveis
        this.credentialCheckInterval = setInterval(() => {
            if (this.connected) {
                // Se já estamos conectados, podemos parar de verificar
                clearInterval(this.credentialCheckInterval);
                return;
            }
            
            // Verifica cookies primeiro (login recente)
            const cookies = document.cookie.split(';').reduce((cookies, cookie) => {
                const [name, value] = cookie.trim().split('=').map(c => c.trim());
                cookies[name] = value;
                return cookies;
            }, {});
            
            let foundNewCredentials = false;
            
            // Verifica token no cookie
            if (cookies.authToken && cookies.authToken !== this.token) {
                debugLog('[NotificationService] Novo token encontrado em cookie');
                this.token = cookies.authToken;
                foundNewCredentials = true;
                
                // Tenta extrair userId do token JWT
                try {
                    const tokenParts = this.token.split('.');
                    if (tokenParts.length === 3) {
                        const payload = JSON.parse(atob(tokenParts[1]));
                        if (payload.userId) {
                            this.userId = payload.userId.toString();
                            debugLog(`[NotificationService] Obteve userId ${this.userId} do token JWT`);
                            localStorage.setItem('userId', this.userId);
                            localStorage.setItem('authToken', this.token);
                            
                            // Verifica se o token precisa ser renovado
                            if (window.setupTokenRefresh) {
                                window.setupTokenRefresh();
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[NotificationService] Erro ao decodificar token JWT', error);
                }
            }
            
            // Verifica localStorage também (pode ter sido atualizado por outra guia)
            const storedUserId = localStorage.getItem('userId');
            const storedToken = localStorage.getItem('authToken');
            
            if (storedToken && storedToken !== this.token) {
                debugLog('[NotificationService] Novo token encontrado no localStorage');
                this.token = storedToken;
                foundNewCredentials = true;
            }
            
            if (storedUserId && storedUserId !== this.userId) {
                debugLog('[NotificationService] Novo userId encontrado no localStorage');
                this.userId = storedUserId;
                foundNewCredentials = true;
            }
            
            // Se encontramos novas credenciais, tentamos conectar
            if (foundNewCredentials && this.userId && this.token) {
                debugLog('[NotificationService] Novas credenciais disponíveis, tentando conectar...');
                this.connect();
            }
        }, 5000); // Verifica a cada 5 segundos
        
        // Também configura listener de eventos para sessão do usuário
        window.addEventListener('storage', (event) => {
            if (['userId', 'authToken'].includes(event.key) && event.newValue) {
                debugLog(`[NotificationService] Mudança em localStorage detectada: ${event.key}`);
                if (event.key === 'userId') this.userId = event.newValue;
                if (event.key === 'authToken') this.token = event.newValue;
                
                if (this.userId && this.token && !this.connected) {
                    debugLog('[NotificationService] Credenciais atualizadas em outra guia, tentando conectar...');
                    this.connect();
                }
            }
        });
        
        // Configura listener de eventos de login/logout da página
        document.addEventListener('auth:login', (event) => {
            debugLog('[NotificationService] Evento auth:login detectado');
            if (event.detail && event.detail.userId && event.detail.token) {
                this.userId = event.detail.userId;
                this.token = event.detail.token;
                debugLog('[NotificationService] Credenciais recebidas de evento auth:login');
                this.connect();
            }
        });
        
        document.addEventListener('auth:logout', () => {
            debugLog('[NotificationService] Evento auth:logout detectado, desconectando...');
            this.disconnect();
            this.userId = null;
            this.token = null;
        });
    }
    
    /**
     * Desconecta do servidor Socket.IO
     */
    disconnect() {
        if (this.socket) {
            debugLog('[Socket.IO] Desconectando...');
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }

    /**
     * Conecta ao servidor Socket.IO
     */
    connect() {
        if (this.connected) return;
        
        if (!this.userId || !this.token) {
            console.warn('[Socket.IO] Tentativa de conexão sem credenciais.');
            return;
        }
        
        // Verifica se o token está prestes a expirar antes de tentar conectar
        try {
            const tokenParts = this.token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                if (payload.exp) {
                    const expirationTime = payload.exp * 1000; // Converte para milissegundos
                    const currentTime = Date.now();
                    const timeUntilExpiration = expirationTime - currentTime;
                    
                    // Se o token expira em menos de 30 segundos, renova antes de conectar
                    if (timeUntilExpiration < 30000 && window.refreshAccessToken) {
                        debugLog('[Socket.IO] Token prestes a expirar, renovando antes de conectar...');
                        window.refreshAccessToken().then(() => {
                            // Atualiza o token e tenta conectar novamente
                            this.token = localStorage.getItem('authToken');
                            this.connect();
                        });
                        return;
                    }
                }
            }
        } catch (error) {
            console.warn('[Socket.IO] Erro ao verificar expiração do token:', error);
        }
        
        debugLog('[Socket.IO] Conectando ao servidor...');
        
        // Cria uma nova conexão Socket.IO com autenticação
        this.socket = io({
            auth: {
                token: this.token
            },
            reconnection: false, // Desabilita reconexão automática do Socket.IO (gerenciamos manualmente)
            timeout: 10000 // 10 segundos de timeout
        });
        
        // Configura os event listeners
        this.setupSocketListeners();
    }

    /**
     * Configura os event listeners do Socket.IO
     */
    setupSocketListeners() {
        if (!this.socket) return;
        
        // Evento de conexão bem-sucedida
        this.socket.on('connect', () => {
            debugLog('[Socket.IO] Conectado ao servidor:', this.socket.id);
            this.connected = true;
            this.reconnectAttempts = 0;
            
            // Quando conectado, entra na sala do usuário
            if (this.userId) {
                this.joinUserRoom();
            }
            
            // Emite evento para outros componentes da aplicação
            document.dispatchEvent(new Event('socket:connected'));
        });
        
        // Evento de desconexão
        this.socket.on('disconnect', (reason) => {
            debugLog(`[Socket.IO] Desconectado: ${reason}`);
            this.connected = false;
            
            // Emite evento para outros componentes da aplicação
            document.dispatchEvent(new CustomEvent('socket:disconnected', {
                detail: { reason }
            }));
            
            // Tenta reconectar automaticamente se não foi uma desconexão intencional
            if (reason !== 'io client disconnect' && this.userId && this.token) {
                debugLog('[Socket.IO] Tentando reconectar...');
                setTimeout(() => {
                    if (!this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        this.connect();
                    }
                }, this.reconnectInterval);
            }
        });
        
        // Evento de erro de autenticação
        this.socket.on('auth_error', (error) => {
            console.error('[Socket.IO Auth] Erro de autenticação:', error);
            this.connected = false;
            
            // Tenta renovar o token e reconectar
            if (window.refreshAccessToken) {
                debugLog('[Socket.IO Auth] Tentando renovar token após erro de autenticação...');
                window.refreshAccessToken().then(() => {
                    // Atualiza o token com o novo valor do localStorage
                    this.token = localStorage.getItem('authToken');
                    // Tenta reconectar após renovar o token
                    setTimeout(() => this.connect(), 1000);
                }).catch(err => {
                    console.error('[Socket.IO Auth] Falha ao renovar token:', err);
                });
            }
            
            // Emite evento para outros componentes da aplicação
            document.dispatchEvent(new CustomEvent('socket:auth_error', {
                detail: { error }
            }));
        });
        
        // Evento de erro geral
        this.socket.on('error', (error) => {
            console.error('[Socket.IO] Erro:', error);
            
            // Emite evento para outros componentes da aplicação
            document.dispatchEvent(new CustomEvent('socket:error', {
                detail: { error }
            }));
        });
        
        // Evento de notificação recebida
        this.socket.on('notification', (data) => {
            debugLog('[Socket.IO] Notificação recebida:', data);
            this.handleNotification(data);
        });
        
        // Evento de atualização de vaga (para páginas de estacionamento)
        this.socket.on('vaga_update', (data) => {
            debugLog('[Socket.IO] Atualização de vaga:', data);
            
            // Emite evento para outros componentes da aplicação
            document.dispatchEvent(new CustomEvent('vaga:update', {
                detail: data
            }));
        });
        
        // Adiciona listener para evento de token renovado
        document.addEventListener('auth:token-refreshed', (event) => {
            if (event.detail && event.detail.token) {
                debugLog('[Socket.IO] Token renovado detectado, atualizando...');
                this.token = event.detail.token;
                
                // Se estiver desconectado, tenta reconectar com o novo token
                if (!this.connected && this.userId) {
                    debugLog('[Socket.IO] Tentando reconectar com novo token...');
                    this.connect();
                }
            }
        });
        
        // Evento de atualização de estacionamento
        this.socket.on('estacionamento:update', (data) => {
            debugLog('[NotificationService] Atualização de estacionamento recebida:', data);
            this.triggerEvent('estacionamento:update', data);
        });
    }

    /**
     * Entra na sala específica do usuário
     */
    joinUserRoom() {
        if (!this.connected || !this.socket || !this.userId) return;
        
        try {
            const roomId = `user:${this.userId}`;
            this.socket.emit('join', { room: roomId }, (response) => {
                if (response.success) {
                    debugLog(`[NotificationService] Entrou na sala ${roomId}`);
                } else {
                    console.error(`[NotificationService] Erro ao entrar na sala ${roomId}: ${response.error}`);
                }
            });
        } catch (error) {
            console.error('[NotificationService] Erro ao entrar na sala do usuário:', error);
        }
    }

    /**
     * Entra na sala de um estacionamento específico
     * @param {number} estacionamentoId - ID do estacionamento
     */
    joinEstacionamentoRoom(estacionamentoId) {
        if (!this.connected || !this.socket || !estacionamentoId) return;
        
        try {
            const roomId = `estacionamento:${estacionamentoId}`;
            this.socket.emit('join', { room: roomId }, (response) => {
                if (response.success) {
                    debugLog(`[NotificationService] Entrou na sala ${roomId}`);
                } else {
                    console.error(`[NotificationService] Erro ao entrar na sala ${roomId}: ${response.error}`);
                }
            });
        } catch (error) {
            console.error('[NotificationService] Erro ao entrar na sala do estacionamento:', error);
        }
    }

    /**
     * Sai da sala de um estacionamento específico
     * @param {number} estacionamentoId - ID do estacionamento
     */
    leaveEstacionamentoRoom(estacionamentoId) {
        if (!this.connected || !this.socket || !estacionamentoId) return;
        
        try {
            const roomId = `estacionamento:${estacionamentoId}`;
            this.socket.emit('leave', { room: roomId }, (response) => {
                if (response.success) {
                    debugLog(`[NotificationService] Saiu da sala ${roomId}`);
                } else {
                    console.error(`[NotificationService] Erro ao sair da sala ${roomId}: ${response.error}`);
                }
            });
        } catch (error) {
            console.error('[NotificationService] Erro ao sair da sala do estacionamento:', error);
        }
    }

    /**
     * Processa a fila de notificações pendentes
     */
    processNotificationQueue() {
        if (this.notificationQueue.length === 0) return;
        
        debugLog(`[NotificationService] Processando ${this.notificationQueue.length} notificações pendentes`);
        
        // Processa todas as notificações da fila
        while (this.notificationQueue.length > 0) {
            const notification = this.notificationQueue.shift();
            this.showNotification(notification);
        }
    }

    /**
     * Manipula uma notificação recebida
     * @param {Object} data - Dados da notificação
     */
    handleNotification(data) {
        if (!data) return;
        
        // Formata a notificação
        const notification = {
            id: data.id || `notification-${Date.now()}`,
            title: data.title || 'Notificação',
            message: data.message || '',
            type: data.type || 'info',
            timestamp: data.timestamp || new Date().toISOString(),
            read: false,
            ...data
        };
        
        // Salva a notificação
        this.saveNotification(notification);
        
        // Mostra a notificação visual
        this.showNotification(notification);
        
        // Dispara o evento de notificação
        this.triggerEvent('notification', notification);
    }

    /**
     * Mostra uma notificação visual
     * @param {Object} notification - Dados da notificação
     */
    showNotification(notification) {
        if (!this.notificationContainer) return;
        
        // Cria um elemento de notificação
        const element = document.createElement('div');
        element.className = `notification notification-${notification.type}`;
        element.dataset.id = notification.id;
        
        // Cria o cabeçalho
        const header = document.createElement('div');
        header.className = 'notification-header';
        
        // Título
        const title = document.createElement('div');
        title.className = 'notification-title';
        title.textContent = notification.title;
        
        // Botão de fechar
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', () => this.removeNotification(element));
        
        header.appendChild(title);
        header.appendChild(closeButton);
        
        // Corpo da notificação
        const body = document.createElement('div');
        body.className = 'notification-body';
        
        const message = document.createElement('p');
        message.textContent = notification.message;
        body.appendChild(message);
        
        // Rodapé
        const footer = document.createElement('div');
        footer.className = 'notification-footer';
        
        const time = document.createElement('div');
        time.className = 'notification-time';
        time.textContent = this.formatTimestamp(notification.timestamp);
        footer.appendChild(time);
        
        // Monta a notificação
        element.appendChild(header);
        element.appendChild(body);
        element.appendChild(footer);
        
        // Adiciona ao container
        this.notificationContainer.appendChild(element);
        
        // Toca o som de notificação
        this.playNotificationSound();
        
        // Auto-remove após 10 segundos
        setTimeout(() => {
            if (element.parentNode === this.notificationContainer) {
                this.removeNotification(element);
            }
        }, 10000);
    }

    /**
     * Remove uma notificação da tela
     * @param {HTMLElement} element - Elemento da notificação
     */
    removeNotification(element) {
        if (!element || !this.notificationContainer) return;
        
        // Adiciona classe de fade out
        element.classList.add('notification-fadeout');
        
        // Remove após a animação
        setTimeout(() => {
            if (element.parentNode === this.notificationContainer) {
                this.notificationContainer.removeChild(element);
            }
        }, 300);
    }

    /**
     * Salva uma notificação no armazenamento local
     * @param {Object} notification - Dados da notificação
     */
    saveNotification(notification) {
        try {
            // Carrega notificações existentes
            let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Limita o número de notificações salvas
            if (notifications.length >= this.maxQueueSize) {
                notifications = notifications.slice(0, this.maxQueueSize - 1);
            }
            
            // Adiciona a nova notificação
            notifications.unshift(notification);
            
            // Salva no localStorage
            localStorage.setItem('notifications', JSON.stringify(notifications));
            
            // Atualiza o contador
            this.updateUnreadCount();
        } catch (error) {
            console.error('[NotificationService] Erro ao salvar notificação:', error);
        }
    }

    /**
     * Carrega notificações do armazenamento local
     */
    loadNotificationsFromStorage() {
        try {
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Atualiza o contador
            this.updateUnreadCount();
            
            return notifications;
        } catch (error) {
            console.error('[NotificationService] Erro ao carregar notificações:', error);
            return [];
        }
    }

    /**
     * Marca uma notificação como lida
     * @param {string} id - ID da notificação
     */
    markAsRead(id) {
        if (!id) return;
        
        try {
            // Carrega notificações existentes
            let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Encontra e marca a notificação como lida
            let updated = false;
            notifications = notifications.map(notification => {
                if (notification.id === id && !notification.read) {
                    updated = true;
                    return { ...notification, read: true };
                }
                return notification;
            });
            
            // Salva no localStorage
            if (updated) {
                localStorage.setItem('notifications', JSON.stringify(notifications));
                
                // Atualiza o contador
                this.updateUnreadCount();
            }
        } catch (error) {
            console.error('[NotificationService] Erro ao marcar notificação como lida:', error);
        }
    }

    /**
     * Marca todas as notificações como lidas
     */
    markAllAsRead() {
        try {
            // Carrega notificações existentes
            let notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Marca todas como lidas
            notifications = notifications.map(notification => ({ ...notification, read: true }));
            
            // Salva no localStorage
            localStorage.setItem('notifications', JSON.stringify(notifications));
            
            // Atualiza o contador
            this.updateUnreadCount();
        } catch (error) {
            console.error('[NotificationService] Erro ao marcar todas notificações como lidas:', error);
        }
    }

    /**
     * Atualiza o contador de notificações não lidas
     */
    updateUnreadCount() {
        try {
            // Carrega notificações existentes
            const notifications = JSON.parse(localStorage.getItem('notifications') || '[]');
            
            // Conta notificações não lidas
            const unreadCount = notifications.filter(notification => !notification.read).length;
            
            // Atualiza o contador visual, se existir
            const countElement = document.getElementById('notificationCount');
            if (countElement) {
                if (unreadCount > 0) {
                    countElement.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    countElement.style.display = 'flex';
                } else {
                    countElement.style.display = 'none';
                }
            }
            
            // Dispara evento
            this.triggerEvent('unreadCount', { count: unreadCount });
        } catch (error) {
            console.error('[NotificationService] Erro ao atualizar contador:', error);
        }
    }

    /**
     * Inicializa o som de notificação
     */
    initNotificationSound() {
        // Como solução definitiva, não usamos som externo
        // Criamos um objeto de áudio vazio em memória
        try {
            // Um som interno extremamente pequeno e simples (1-bit beep)
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.notificationSound = {
                play: () => {
                    if (!this.soundEnabled) return Promise.resolve();
                    
                    try {
                        // Cria um oscilador (beep simples)
                        const oscillator = audioContext.createOscillator();
                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // 880Hz = A5
                        
                        // Controle de volume
                        const gainNode = audioContext.createGain();
                        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // 10% volume
                        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3); // Fade out
                        
                        // Conecta o oscilador à saída
                        oscillator.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        
                        // Inicia e para o som
                        oscillator.start(audioContext.currentTime);
                        oscillator.stop(audioContext.currentTime + 0.3); // 300ms de duração
                        
                        return Promise.resolve();
                    } catch (error) {
                        console.warn(`[NotificationService] Erro ao gerar som: ${error}`);
                        return Promise.resolve();
                    }
                },
                pause: () => {}
            };
        } catch (error) {
            console.warn('[NotificationService] Web Audio API não suportada, som desativado');
            // Objeto vazio para evitar erros
            this.notificationSound = {
                play: () => Promise.resolve(),
                pause: () => {}
            };
            this.soundEnabled = false;
        }
    }
    
    /**
     * Toca o som de notificação
     */
    playNotificationSound() {
        if (!this.soundEnabled || !this.notificationSound) return;
        
        try {
            // Reproduz o som
            this.notificationSound.play().catch(error => {
                // Se ocorrer algum erro, desativamos o som
                console.warn(`[NotificationService] Erro ao tocar som: ${error}`);
                if (error.name === 'NotAllowedError') {
                    debugLog('[NotificationService] Som desativado devido à política do navegador');
                    this.soundEnabled = false;
                }
            });
        } catch (error) {
            console.warn(`[NotificationService] Erro ao tocar som: ${error}`);
            this.soundEnabled = false;
        }
    }

    /**
     * Ativa ou desativa o som de notificação
     * @param {boolean} enabled - Se o som deve estar habilitado
     */
    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        localStorage.setItem('notificationSoundEnabled', enabled ? 'true' : 'false');
    }

    /**
     * Adiciona um event listener para eventos de notificação
     * @param {string} event - Nome do evento
     * @param {Function} callback - Função de callback
     */
    on(event, callback) {
        if (!event || typeof callback !== 'function') return;
        
        this.listeners[event] = this.listeners[event] || [];
        this.listeners[event].push(callback);
    }

    /**
     * Remove um event listener
     * @param {string} event - Nome do evento
     * @param {Function} callback - Função de callback a ser removida
     */
    off(event, callback) {
        if (!event || !this.listeners[event]) return;
        
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Dispara um evento para todos os listeners
     * @param {string} event - Nome do evento
     * @param {Object} data - Dados do evento
     */
    triggerEvent(event, data) {
        if (!event || !this.listeners[event]) return;
        
        this.listeners[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[NotificationService] Erro ao executar listener para evento '${event}':`, error);
            }
        });
    }

    /**
     * Formata um timestamp para exibição
     * @param {string} timestamp - Timestamp ISO
     * @returns {string} - Timestamp formatado
     */
    formatTimestamp(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (error) {
            return timestamp;
        }
    }

    /**
     * Retorna o texto do status de uma reserva
     * @param {string} status - Status da reserva
     * @returns {string} - Texto do status
     */
    getReservaStatusText(status) {
        const statusMap = {
            'pendente': 'Pendente',
            'confirmada': 'Confirmada',
            'cancelada': 'Cancelada',
            'concluida': 'Concluída',
            'em_andamento': 'Em Andamento',
            'expirada': 'Expirada'
        };
        
        return statusMap[status] || status;
    }

    /**
     * Retorna o tipo de notificação para um status de reserva
     * @param {string} status - Status da reserva
     * @returns {string} - Tipo de notificação
     */
    getReservaStatusType(status) {
        const typeMap = {
            'pendente': 'info',
            'confirmada': 'success',
            'cancelada': 'danger',
            'concluida': 'success',
            'em_andamento': 'warning',
            'expirada': 'danger'
        };
        
        return typeMap[status] || 'info';
    }

    /**
     * Retorna os estilos CSS padrão para as notificações
     * @returns {string} - CSS para notificações
     */
    getDefaultStyles() {
        return `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                width: 320px;
                max-width: 100%;
            }
            
            .notification {
                margin-bottom: 10px;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                background-color: #fff;
                transform: translateX(0);
                opacity: 1;
                transition: transform 0.3s ease, opacity 0.3s ease;
                overflow: hidden;
                border-left: 4px solid #ccc;
            }
            
            .notification-info {
                border-left-color: #3498db;
            }
            
            .notification-success {
                border-left-color: #2ecc71;
            }
            
            .notification-warning {
                border-left-color: #f39c12;
            }
            
            .notification-danger {
                border-left-color: #e74c3c;
            }
            
            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .notification-title {
                font-weight: bold;
                color: #333;
            }
            
            .notification-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
                padding: 0;
                line-height: 1;
            }
            
            .notification-body {
                margin-bottom: 8px;
            }
            
            .notification-body p {
                margin: 0;
                color: #666;
            }
            
            .notification-footer {
                display: flex;
                justify-content: flex-end;
            }
            
            .notification-time {
                font-size: 12px;
                color: #999;
            }
            
            .notification-fadeout {
                transform: translateX(100%);
                opacity: 0;
            }
            
            #notificationCount {
                position: absolute;
                top: -8px;
                right: -8px;
                background-color: #e74c3c;
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
            }
        `;
    }
}

// Cria uma instância global do serviço de notificações
const notificationService = new NotificationService();

// Exporta a instância
window.notificationService = notificationService;
