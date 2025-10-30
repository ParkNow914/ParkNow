/**
 * Date Utilities for ParkNow
 * Provides consistent date formatting and timezone handling
 */

class DateUtils {
    constructor() {
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for timezone changes
     */
    initializeEventListeners() {
        window.addEventListener('timezoneChanged', (event) => {
            this.timezone = event.detail.timezone;
        });
    }

    /**
     * Format a date in the user's local timezone
     * @param {Date|string} date - The date to format
     * @param {Object} options - Formatting options (optional)
     * @returns {string} Formatted date string
     */
    formatDate(date, options = {}) {
        if (!date) return '';
        
        const defaultOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: this.timezone
        };

        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            if (isNaN(dateObj.getTime())) {
                console.error('Invalid date:', date);
                return 'Data inválida';
            }
            return new Intl.DateTimeFormat(navigator.language, mergedOptions).format(dateObj);
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Erro ao formatar data';
        }
    }

    /**
     * Format a date range (e.g., "01/01/2023 10:00 - 12:00")
     * @param {Date|string} startDate - Start date
     * @param {Date|string} endDate - End date
     * @param {Object} options - Formatting options (optional)
     * @returns {string} Formatted date range string
     */
    formatDateRange(startDate, endDate, options = {}) {
        if (!startDate || !endDate) return '';
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.error('Invalid date range:', { startDate, endDate });
            return 'Período inválido';
        }

        const dateOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            ...options
        };

        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            ...options
        };

        const formattedDate = this.formatDate(start, dateOptions);
        const startTime = this.formatDate(start, timeOptions);
        const endTime = this.formatDate(end, timeOptions);

        return `${formattedDate} ${startTime} - ${endTime}`;
    }

    /**
     * Format a duration in minutes to a human-readable string (e.g., "2h 30min")
     * @param {number} minutes - Duration in minutes
     * @returns {string} Formatted duration string
     */
    formatDuration(minutes) {
        if (typeof minutes !== 'number' || isNaN(minutes)) {
            return 'Duração inválida';
        }

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        let result = [];
        if (hours > 0) result.push(`${hours}h`);
        if (remainingMinutes > 0 || hours === 0) {
            result.push(`${remainingMinutes}min`);
        }

        return result.join(' ');
    }

    /**
     * Get the current timezone
     * @returns {string} Current timezone
     */
    getCurrentTimezone() {
        return this.timezone;
    }

    /**
     * Set the current timezone
     * @param {string} timezone - Timezone string (e.g., 'America/Sao_Paulo')
     */
    setTimezone(timezone) {
        if (timezone && typeof timezone === 'string') {
            this.timezone = timezone;
        }
    }
}

// Initialize DateUtils when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dateUtils = new DateUtils();
    
    // If timezoneManager is available, sync timezone with DateUtils
    if (window.timezoneManager) {
        window.dateUtils.setTimezone(window.timezoneManager.getCurrentTimezone());
    }
});
