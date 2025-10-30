/**
 * notificationService.js
 * Sistema centralizado de notificações em tempo real para o ParkNow
 * Este serviço gerencia a conexão com Socket.IO e as notificações para todas as páginas
 */

// Classe principal para gerenciar notificações
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
        this.userId = options.userId || localStorage.getItem('userId');
        this.token = options.token || localStorage.getItem('authToken');
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
        
        // Verifica credenciais antes de conectar
        if(!this.userId || !this.token) {
            console.log('[NotificationService] Sem credenciais de usuário - funcionando em modo offline');
            // Tentamos obter de localStorage como alternativa
            const storedUserId = localStorage.getItem('userId');
            const storedToken = localStorage.getItem('authToken');
            
            if(storedUserId && storedToken) {
                this.userId = storedUserId;
                this.token = storedToken;
                // Agora tentamos conectar com as credenciais armazenadas
                console.log('[NotificationService] Usando credenciais salvas para conectar...');
                this.connect();
            }
        } else {
            // Temos credenciais, vamos conectar
            this.connect();
        }
        
        // Marca como inicializado
        this.initialized = true;
        
        // Carrega notificações anteriores do localStorage
        this.loadNotificationsFromStorage();
        
        console.log('[NotificationService] Serviço inicializado com sucesso');
    }

    /**
     * Conecta ao servidor Socket.IO
     */
    connect() {
        if (!this.token || !this.userId) {
            console.warn('[NotificationService] Token ou userId não disponíveis para conexão Socket.IO');
            return;
        }

        try {
            console.log('[NotificationService] Tentando conectar ao servidor Socket.IO...');
            
            // Verifica se o Socket.IO está disponível
            if (typeof io === 'undefined') {
                console.error('[NotificationService] Socket.IO não está disponível. Verifique se o script foi carregado.');
                return;
            }

            // Conecta ao servidor Socket.IO com autenticação
            this.socket = io({
                auth: {
                    token: this.token
                },
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectInterval,
                timeout: 10000
            });

            // Configura os event listeners do Socket.IO
            this.setupSocketListeners();
            
        } catch (error) {
            console.error('[NotificationService] Erro ao conectar ao Socket.IO:', error);
        }
    }

    /**
     * Configura os event listeners do Socket.IO
     */
    setupSocketListeners() {
        if (!this.socket) return;
        
        // Evento de conexão bem-sucedida
        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log(`[NotificationService] Conectado ao Socket.IO. Socket ID: ${this.socket.id}`);
            
            // Entra nas salas necessárias
            this.joinUserRoom();
            
            // Processa a fila de notificações pendentes
            this.processNotificationQueue();
            
            // Dispara evento de conexão para quem estiver escutando
            this.triggerEvent('connect', { socketId: this.socket.id });
        });
        
        // Evento de desconexão
        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            console.warn(`[NotificationService] Desconectado do Socket.IO. Motivo: ${reason}`);
            
            // Dispara evento de desconexão
            this.triggerEvent('disconnect', { reason });
        });
        
        // Evento de erro
        this.socket.on('connect_error', (error) => {
            console.error(`[NotificationService] Erro de conexão Socket.IO: ${error.message}`);
            
            // Limita as tentativas de reconexão
            this.reconnectAttempts++;
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error(`[NotificationService] Número máximo de tentativas de reconexão atingido (${this.maxReconnectAttempts})`);
                this.socket.disconnect();
            }
            
            // Dispara evento de erro
            this.triggerEvent('error', { error: error.message });
        });
        
        // Evento de reconexão
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`[NotificationService] Reconectado ao Socket.IO após ${attemptNumber} tentativas`);
            
            // Reseta contador de tentativas
            this.reconnectAttempts = 0;
            
            // Dispara evento de reconexão
            this.triggerEvent('reconnect', { attemptNumber });
        });
        
        // Evento de notificação
        this.socket.on('notification', (data) => {
            console.log('[NotificationService] Notificação recebida:', data);
            this.handleNotification(data);
        });
        
        // Evento de atualização de usuário
        this.socket.on('user:update', (data) => {
            console.log('[NotificationService] Atualização de usuário recebida:', data);
            this.triggerEvent('user:update', data);
        });
        
        // Evento de atualização de reserva
        this.socket.on('reserva:update', (data) => {
            console.log('[NotificationService] Atualização de reserva recebida:', data);
            this.triggerEvent('reserva:update', data);
        });
        
        // Evento de atualização de estacionamento
        this.socket.on('estacionamento:update', (data) => {
            console.log('[NotificationService] Atualização de estacionamento recebida:', data);
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
                    console.log(`[NotificationService] Entrou na sala ${roomId}`);
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
                    console.log(`[NotificationService] Entrou na sala ${roomId}`);
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
                    console.log(`[NotificationService] Saiu da sala ${roomId}`);
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
        
        console.log(`[NotificationService] Processando ${this.notificationQueue.length} notificações pendentes`);
        
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
            console.log(`[NotificationService] Carregadas ${notifications.length} notificações do armazenamento local`);
            
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
        try {
            // Usamos o CDN para o som de notificação
            const soundUrl = 'https://cdn.jsdelivr.net/gh/mozillabrasil/sumo_live_helper@master/src/sounds/doorbell.mp3';
            const fallbackUrl = 'https://cdn.jsdelivr.net/gh/mozillabrasil/sumo_live_helper@master/src/sounds/notification.mp3';
            
            // Cria o elemento de áudio
            this.notificationSound = new Audio();
            this.notificationSound.volume = 0.5;
            this.notificationSound.preload = 'auto';
            this.notificationSound.src = soundUrl;
            
            // Trata erros de carregamento do som principal
            this.notificationSound.onerror = () => {
                console.warn('[NotificationService] Erro ao carregar som de notificação principal, tentando alternativa');
                this.notificationSound.src = fallbackUrl;
                
                // Se o fallback também falhar
                this.notificationSound.onerror = () => {
                    console.warn('[NotificationService] Erro ao carregar som de notificação alternativo');
                    // Tentamos um último recurso: som embutido em base64 (muito pequeno)
                    const tinySound = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAoAA==';
                    this.notificationSound.src = tinySound;
                };
            };
        } catch (error) {
            console.error('[NotificationService] Erro ao inicializar som:', error);
            // Criamos um objeto mudo para evitar erros
            this.notificationSound = { 
                play: () => Promise.resolve(), 
                pause: () => {} 
            };
        }
    }

    /**
     * Toca o som de notificação
     */
    playNotificationSound() {
        if (!this.soundEnabled || !this.notificationSound) return;
        
        try {
            // Reseta o som para o início
            if (this.notificationSound.pause) {
                this.notificationSound.pause();
            }
            if (this.notificationSound.currentTime !== undefined) {
                this.notificationSound.currentTime = 0;
            }
            
            // Toca o som com tratamento de promessa
            const playPromise = this.notificationSound.play();
            
            // Trata erros de reprodução modernas (muitos navegadores bloqueiam reprodução automática)
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn(`[NotificationService] Erro ao tocar som de notificação: ${error}`);
                    
                    // Se for erro de interação do usuário, desativamos o som
                    if (error.name === 'NotAllowedError') {
                        console.log('[NotificationService] Som desativado devido à política do navegador');
                        this.soundEnabled = false;
                    }
                });
            }
        } catch (error) {
            console.error('[NotificationService] Erro ao tocar som de notificação:', error);
            // Desativa o som para evitar erros constantes
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
