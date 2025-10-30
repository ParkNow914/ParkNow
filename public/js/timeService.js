/**
 * Serviço de Tempo do ParkNow
 * Gerencia o tempo do cliente e sincroniza com o servidor
 */

class TimeService {
    constructor() {
        this.timezone = 'America/Sao_Paulo';
        this.offset = -3; // Default offset em horas
        this.syncInterval = 5 * 60 * 1000; // Sincronizar a cada 5 minutos
        this.syncTimeout = null;
        this.initialize();
    }

    /**
     * Inicializa o serviço de tempo
     */
    async initialize() {
        try {
            await this.syncTime();
            this.scheduleNextSync();
            this.setupEventListeners();
        } catch (error) {
            console.error('Erro ao inicializar TimeService:', error);
            // Tenta novamente após 30 segundos
            setTimeout(() => this.initialize(), 30000);
        }
    }

    /**
     * Sincroniza o horário com o servidor
     */
    async syncTime() {
        try {
            const response = await fetch('/api/time/current');
            if (!response.ok) {
                throw new Error('Falha ao sincronizar horário');
            }

            const data = await response.json();
            if (data.success) {
                this.timezone = data.timezone;
                this.offset = data.offset;
                this.lastSync = new Date();
                this.dispatchTimeUpdated();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Erro ao sincronizar horário:', error);
            return false;
        }
    }

    /**
     * Agenda a próxima sincronização
     */
    scheduleNextSync() {
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        this.syncTimeout = setTimeout(() => this.syncTime(), this.syncInterval);
    }

    /**
     * Configura listeners de eventos
     */
    setupEventListeners() {
        // Sincroniza quando a página ganha foco
        window.addEventListener('focus', () => this.syncTime());
        
        // Sincroniza quando a conexão é restaurada
        window.addEventListener('online', () => this.syncTime());
    }

    /**
     * Dispara evento de atualização de tempo
     */
    dispatchTimeUpdated() {
        const event = new CustomEvent('timeUpdated', {
            detail: {
                timezone: this.timezone,
                offset: this.offset,
                currentTime: new Date()
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * Formata uma data no fuso horário local
     * @param {Date|string} date - Data a ser formatada
     * @param {string} [format='yyyy-MM-dd HH:mm:ss'] - Formato desejado
     * @returns {string} Data formatada
     */
    formatDate(date, format = 'yyyy-MM-dd HH:mm:ss') {
        if (!date) return '';
        
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return 'Data inválida';
        
        // Ajusta para o fuso horário local
        const localTime = new Date(dateObj.getTime() + (this.offset * 60 * 60 * 1000));
        
        // Formatação simples (pode ser substituída por uma biblioteca como date-fns)
        const pad = (num) => String(num).padStart(2, '0');
        
        return format
            .replace('yyyy', localTime.getFullYear())
            .replace('MM', pad(localTime.getMonth() + 1))
            .replace('dd', pad(localTime.getDate()))
            .replace('HH', pad(localTime.getHours()))
            .replace('mm', pad(localTime.getMinutes()))
            .replace('ss', pad(localTime.getSeconds()));
    }

    /**
     * Obtém o horário atual no fuso horário local
     * @returns {Date}
     */
    getCurrentTime() {
        const now = new Date();
        return new Date(now.getTime() + (this.offset * 60 * 60 * 1000));
    }
}

// Cria uma instância global do serviço de tempo
if (!window.timeService) {
    window.timeService = new TimeService();
}

export default window.timeService;
