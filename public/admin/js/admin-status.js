/**
 * admin-status.js - Gerencia a página de status do administrador
 * Responsável por atualizar o status do sistema e gerenciar as conexões Socket.IO
 */

// Configurações
const CONFIG = {
    updateInterval: 30000, // Intervalo de atualização automática (30 segundos)
    connectionUpdateInterval: 60000, // Intervalo de atualização de conexões (1 minuto)
    apiEndpoints: {
        serverStatus: '/api/status/server',
        connectionStatus: '/api/status/connection',
        clearCache: '/api/admin/cache/clear',
        restartSocket: '/api/admin/socket/restart',
        logs: '/api/admin/logs/recent',
        testNotification: '/api/admin/notifications/test'
    }
};

// Classe principal para gerenciar a página de status
class AdminStatusManager {
    constructor() {
        this.socket = null;
        this.updateTimers = {
            server: null,
            connections: null
        };
        this.lastUpdateTime = null;
    }

    // Inicializa a página
    init() {
        this.setupEventListeners();
        this.checkAuthentication();
        this.updateServerStatus();
        this.updateConnectionsStatus();
        this.setupAutoUpdate();
        this.connectSocket();
    }

    // Verifica se o administrador está autenticado
    checkAuthentication() {
        const token = this.getAuthToken();
        if (!token) {
            window.location.href = '/admin/login.html';
            return false;
        }
        return true;
    }

    // Configura os event listeners para os botões da página
    setupEventListeners() {
        // Botão de atualizar status do servidor
        $('#refreshServerBtn').click(() => {
            this.showButtonLoading('#refreshServerBtn');
            this.updateServerStatus().finally(() => {
                this.hideButtonLoading('#refreshServerBtn');
            });
        });

        // Botão de atualizar status das conexões
        $('#refreshConnectionsBtn').click(() => {
            this.showButtonLoading('#refreshConnectionsBtn');
            this.updateConnectionsStatus().finally(() => {
                this.hideButtonLoading('#refreshConnectionsBtn');
            });
        });

        // Botão de limpar cache
        $('#clearCacheBtn').click(() => this.clearCache());

        // Botão de reiniciar Socket.IO
        $('#restartSocketBtn').click(() => this.restartSocket());

        // Botão de verificar logs
        $('#checkLogsBtn').click(() => this.checkLogs());

        // Botão de testar notificações
        $('#testNotificationBtn').click(() => this.testNotification());
    }

    // Configura a atualização automática
    setupAutoUpdate() {
        // Limpar timers existentes
        if (this.updateTimers.server) clearInterval(this.updateTimers.server);
        if (this.updateTimers.connections) clearInterval(this.updateTimers.connections);

        // Configurar novos timers
        this.updateTimers.server = setInterval(() => this.updateServerStatus(), CONFIG.updateInterval);
        this.updateTimers.connections = setInterval(() => this.updateConnectionsStatus(), CONFIG.connectionUpdateInterval);
    }

    // Conecta ao Socket.IO para atualizações em tempo real
    connectSocket() {
        try {
            this.socket = io();

            this.socket.on('connect', () => {
                console.log('Conectado ao Socket.IO');
                
                // Entrar na sala de administradores para receber atualizações específicas
                this.socket.emit('joinAdminRoom', { token: this.getAuthToken() });
            });

            this.socket.on('serverStatusUpdate', (data) => {
                console.log('Atualização de status recebida:', data);
                this.updateServerStatus();
            });

            this.socket.on('connectionStatusUpdate', (data) => {
                console.log('Atualização de conexões recebida:', data);
                this.updateConnectionsStatus();
            });

            this.socket.on('disconnect', () => {
                console.log('Desconectado do Socket.IO');
                this.showAlert('A conexão com o servidor foi perdida. Tentando reconectar...', 'warning');
            });
        } catch (error) {
            console.error('Erro ao conectar ao Socket.IO:', error);
        }
    }

    // Atualiza o status do servidor
    async updateServerStatus() {
        try {
            const data = await this.fetchWithAuth(CONFIG.apiEndpoints.serverStatus);
            
            // Atualizar status do servidor
            $('#serverStatus').html(`
                <span class="status-indicator ${data.status === 'online' ? 'status-online' : 'status-offline'}"></span>
                ${data.status === 'online' ? 'Online' : 'Offline'}
            `);
            
            // Atualizar status das conexões
            $('#dbStatus').html(`
                <span class="status-indicator ${data.connections.database === 'online' ? 'status-online' : 'status-offline'}"></span>
                ${data.connections.database === 'online' ? 'Conectado' : 'Desconectado'}
            `);
            
            $('#redisStatus').html(`
                <span class="status-indicator ${data.connections.redis === 'online' ? 'status-online' : 'status-offline'}"></span>
                ${data.connections.redis === 'online' ? 'Conectado' : 'Desconectado'}
            `);
            
            $('#socketStatus').html(`
                <span class="status-indicator ${data.connections.socketIO === 'online' ? 'status-online' : 'status-offline'}"></span>
                ${data.connections.socketIO === 'online' ? 'Conectado' : 'Desconectado'}
            `);
            
            // Atualizar informações do sistema
            $('#uptime').text(this.formatTime(data.system.uptime));
            $('#memoryInfo').text(`${this.formatBytes(data.system.memory.used)} / ${this.formatBytes(data.system.memory.total)}`);
            
            const memoryPercentage = (data.system.memory.used / data.system.memory.total) * 100;
            $('#memoryUsage').css('width', `${memoryPercentage}%`);
            
            if (memoryPercentage > 80) {
                $('#memoryUsage').removeClass('bg-info').addClass('bg-danger');
            } else if (memoryPercentage > 60) {
                $('#memoryUsage').removeClass('bg-info').addClass('bg-warning');
            } else {
                $('#memoryUsage').removeClass('bg-danger bg-warning').addClass('bg-info');
            }
            
            $('#platform').text(`${data.system.platform} (${data.system.hostname})`);
            $('#nodeVersion').text(data.system.nodeVersion);
            
            // Atualizar hora da última atualização
            this.lastUpdateTime = new Date();
            $('#lastUpdateTime').text(this.lastUpdateTime.toLocaleTimeString());
            
            return data;
        } catch (error) {
            console.error('Erro ao atualizar status do servidor:', error);
            this.showAlert('Erro ao atualizar status do servidor. Verifique o console para mais detalhes.', 'danger');
            throw error;
        }
    }

    // Atualiza o status das conexões
    async updateConnectionsStatus() {
        try {
            const data = await this.fetchWithAuth(CONFIG.apiEndpoints.connectionStatus);
            
            let tableHtml = '';
            
            if (data.connections && data.connections.length > 0) {
                data.connections.forEach(conn => {
                    tableHtml += `
                        <tr>
                            <td>${conn.type}</td>
                            <td>${conn.total}</td>
                            <td>
                                <span class="status-indicator ${conn.status === 'online' ? 'status-online' : 'status-offline'}"></span>
                                ${conn.status === 'online' ? 'Ativo' : 'Inativo'}
                            </td>
                        </tr>
                    `;
                });
            } else {
                tableHtml = `
                    <tr>
                        <td colspan="3" class="text-center">
                            Nenhuma conexão ativa no momento.
                        </td>
                    </tr>
                `;
            }
            
            $('#connectionsTableBody').html(tableHtml);
            
            return data;
        } catch (error) {
            console.error('Erro ao atualizar status das conexões:', error);
            this.showAlert('Erro ao atualizar status das conexões. Verifique o console para mais detalhes.', 'danger');
            
            // Exibir mensagem de erro na tabela
            $('#connectionsTableBody').html(`
                <tr>
                    <td colspan="3" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> 
                        Erro ao carregar informações de conexões.
                    </td>
                </tr>
            `);
            
            throw error;
        }
    }

    // Limpa o cache do sistema
    async clearCache() {
        if (!confirm('Tem certeza que deseja limpar todo o cache do sistema?')) {
            return;
        }
        
        try {
            const response = await this.fetchWithAuth(CONFIG.apiEndpoints.clearCache, {
                method: 'POST'
            });
            
            if (response.success) {
                this.showAlert('Cache limpo com sucesso!', 'success');
            } else {
                this.showAlert(`Erro ao limpar cache: ${response.message}`, 'danger');
            }
        } catch (error) {
            console.error('Erro ao limpar cache:', error);
            this.showAlert('Erro ao limpar cache. Verifique o console para mais detalhes.', 'danger');
        }
    }

    // Reinicia o serviço Socket.IO
    async restartSocket() {
        if (!confirm('Tem certeza que deseja reiniciar o serviço Socket.IO? Isso afetará todas as conexões em tempo real.')) {
            return;
        }
        
        try {
            const response = await this.fetchWithAuth(CONFIG.apiEndpoints.restartSocket, {
                method: 'POST'
            });
            
            if (response.success) {
                this.showAlert('Serviço Socket.IO reiniciado com sucesso!', 'success');
            } else {
                this.showAlert(`Erro ao reiniciar Socket.IO: ${response.message}`, 'danger');
            }
        } catch (error) {
            console.error('Erro ao reiniciar Socket.IO:', error);
            this.showAlert('Erro ao reiniciar Socket.IO. Verifique o console para mais detalhes.', 'danger');
        }
    }

    // Verifica os logs recentes
    async checkLogs() {
        try {
            const response = await this.fetchWithAuth(CONFIG.apiEndpoints.logs);
            
            if (response.logs && response.logs.length > 0) {
                let logHtml = '<div class="system-info"><h5>Logs Recentes:</h5><pre style="max-height: 300px; overflow-y: auto;">';
                
                response.logs.forEach(log => {
                    logHtml += `[${log.timestamp}] [${log.level}] ${log.message}\n`;
                });
                
                logHtml += '</pre></div>';
                
                this.showAlert(logHtml, 'info', 0);
            } else {
                this.showAlert('Nenhum log recente encontrado.', 'info');
            }
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
            this.showAlert('Erro ao buscar logs. Verifique o console para mais detalhes.', 'danger');
        }
    }

    // Testa o envio de notificações
    async testNotification() {
        try {
            const response = await this.fetchWithAuth(CONFIG.apiEndpoints.testNotification, {
                method: 'POST'
            });
            
            if (response.success) {
                this.showAlert('Notificação de teste enviada com sucesso!', 'success');
            } else {
                this.showAlert(`Erro ao enviar notificação: ${response.message}`, 'danger');
            }
        } catch (error) {
            console.error('Erro ao enviar notificação de teste:', error);
            this.showAlert('Erro ao enviar notificação de teste. Verifique o console para mais detalhes.', 'danger');
        }
    }

    // Utilitários
    getAuthToken() {
        return localStorage.getItem('adminAuthToken');
    }

    async fetchWithAuth(url, options = {}) {
        const token = this.getAuthToken();
        if (!token) {
            window.location.href = '/admin/login.html';
            return;
        }
        
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, mergedOptions);
            
            if (response.status === 401) {
                // Token expirado ou inválido
                localStorage.removeItem('adminAuthToken');
                window.location.href = '/admin/login.html';
                return;
            }
            
            return await response.json();
        } catch (error) {
            console.error('Erro na requisição:', error);
            throw error;
        }
    }

    showAlert(message, type = 'info', duration = 5000) {
        const id = `alert-${Date.now()}`;
        const alertHtml = `
            <div id="${id}" class="alert alert-${type} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
        `;
        
        $('#mainAlertBox').append(alertHtml);
        
        if (duration > 0) {
            setTimeout(() => {
                $(`#${id}`).alert('close');
            }, duration);
        }
    }

    showButtonLoading(selector) {
        const button = $(selector);
        button.data('original-html', button.html());
        button.html('<span class="loading-spinner"></span> Atualizando...');
        button.prop('disabled', true);
    }

    hideButtonLoading(selector) {
        const button = $(selector);
        button.html(button.data('original-html'));
        button.prop('disabled', false);
    }

    formatTime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let result = '';
        if (days > 0) result += `${days}d `;
        if (hours > 0 || days > 0) result += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
        result += `${secs}s`;
        
        return result;
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}

// Inicialização quando o documento estiver pronto
$(document).ready(() => {
    const statusManager = new AdminStatusManager();
    statusManager.init();
});
