// Extraído de public/admin/status.html (bloco inline #1) para permitir CSP sem unsafe-inline.
// Funções de utilidade
        function formatTime(seconds) {
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
        
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
        
        function showAlert(message, type = 'info', duration = 5000) {
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
        
        function getAuthToken() {
            return localStorage.getItem('adminAuthToken');
        }
        
        async function fetchWithAuth(url, options = {}) {
            const token = getAuthToken();
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
                showAlert(`Erro na requisição: ${error.message}`, 'danger');
                throw error;
            }
        }
        
        // Funções de atualização de status
        async function updateServerStatus() {
            try {
                const data = await fetchWithAuth('/api/status/server');
                
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
                $('#uptime').text(formatTime(data.system.uptime));
                $('#memoryInfo').text(`${formatBytes(data.system.memory.used)} / ${formatBytes(data.system.memory.total)}`);
                
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
                $('#lastUpdateTime').text(new Date().toLocaleTimeString());
                
            } catch (error) {
                console.error('Erro ao atualizar status do servidor:', error);
                showAlert('Erro ao atualizar status do servidor. Verifique o console para mais detalhes.', 'danger');
            }
        }
        
        async function updateConnectionsStatus() {
            try {
                const data = await fetchWithAuth('/api/status/connection');
                
                let tableHtml = '';
                
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
                
                $('#connectionsTableBody').html(tableHtml);
                
            } catch (error) {
                console.error('Erro ao atualizar status das conexões:', error);
                showAlert('Erro ao atualizar status das conexões. Verifique o console para mais detalhes.', 'danger');
            }
        }
        
        // Inicialização
        $(document).ready(function() {
            // Verificar autenticação
            const token = getAuthToken();
            if (!token) {
                window.location.href = '/admin/login.html';
                return;
            }
            
            // Atualizar status inicial
            updateServerStatus();
            updateConnectionsStatus();
            
            // Configurar eventos de botões
            $('#refreshServerBtn').click(function() {
                $(this).html('<span class="loading-spinner"></span> Atualizando...');
                updateServerStatus().finally(() => {
                    $(this).html('<i class="fas fa-sync-alt"></i> Atualizar');
                });
            });
            
            $('#refreshConnectionsBtn').click(function() {
                $(this).html('<span class="loading-spinner"></span> Atualizando...');
                updateConnectionsStatus().finally(() => {
                    $(this).html('<i class="fas fa-sync-alt"></i> Atualizar');
                });
            });
            
            $('#clearCacheBtn').click(async function() {
                if (confirm('Tem certeza que deseja limpar todo o cache do sistema?')) {
                    try {
                        const response = await fetchWithAuth('/api/admin/cache/clear', {
                            method: 'POST'
                        });
                        
                        if (response.success) {
                            showAlert('Cache limpo com sucesso!', 'success');
                        } else {
                            showAlert(`Erro ao limpar cache: ${response.message}`, 'danger');
                        }
                    } catch (error) {
                        showAlert('Erro ao limpar cache', 'danger');
                    }
                }
            });
            
            $('#restartSocketBtn').click(async function() {
                if (confirm('Tem certeza que deseja reiniciar o serviço Socket.IO? Isso afetará todas as conexões em tempo real.')) {
                    try {
                        const response = await fetchWithAuth('/api/admin/socket/restart', {
                            method: 'POST'
                        });
                        
                        if (response.success) {
                            showAlert('Serviço Socket.IO reiniciado com sucesso!', 'success');
                        } else {
                            showAlert(`Erro ao reiniciar Socket.IO: ${response.message}`, 'danger');
                        }
                    } catch (error) {
                        showAlert('Erro ao reiniciar Socket.IO', 'danger');
                    }
                }
            });
            
            $('#checkLogsBtn').click(async function() {
                try {
                    const response = await fetchWithAuth('/api/admin/logs/recent');
                    
                    if (response.logs && response.logs.length > 0) {
                        let logHtml = '<div class="system-info"><h5>Logs Recentes:</h5><pre style="max-height: 300px; overflow-y: auto;">';
                        
                        response.logs.forEach(log => {
                            logHtml += `[${log.timestamp}] [${log.level}] ${log.message}\n`;
                        });
                        
                        logHtml += '</pre></div>';
                        
                        showAlert(logHtml, 'info', 0);
                    } else {
                        showAlert('Nenhum log recente encontrado.', 'info');
                    }
                } catch (error) {
                    showAlert('Erro ao buscar logs', 'danger');
                }
            });
            
            $('#testNotificationBtn').click(async function() {
                try {
                    const response = await fetchWithAuth('/api/admin/notifications/test', {
                        method: 'POST'
                    });
                    
                    if (response.success) {
                        showAlert('Notificação de teste enviada com sucesso!', 'success');
                    } else {
                        showAlert(`Erro ao enviar notificação: ${response.message}`, 'danger');
                    }
                } catch (error) {
                    showAlert('Erro ao enviar notificação de teste', 'danger');
                }
            });
            
            // Atualização automática a cada 30 segundos
            setInterval(updateServerStatus, 30000);
            setInterval(updateConnectionsStatus, 60000);
            
            // Conectar ao Socket.IO para atualizações em tempo real
            const socket = io();
            
            socket.on('connect', () => {
                console.log('Conectado ao Socket.IO');
                
                // Entrar na sala de administradores para receber atualizações específicas
                socket.emit('joinAdminRoom', { token: getAuthToken() });
            });
            
            socket.on('serverStatusUpdate', (data) => {
                console.log('Atualização de status recebida:', data);
                // Atualizar interface com os novos dados
                updateServerStatus();
            });
            
            socket.on('connectionStatusUpdate', (data) => {
                console.log('Atualização de conexões recebida:', data);
                // Atualizar interface com os novos dados
                updateConnectionsStatus();
            });
            
            socket.on('disconnect', () => {
                console.log('Desconectado do Socket.IO');
                showAlert('A conexão com o servidor foi perdida. Tentando reconectar...', 'warning');
            });
        });
