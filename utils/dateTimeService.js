const { format, zonedTimeToUtc, utcToZonedTime, toDate: _toDate } = require('date-fns-tz');
const { parseISO } = require('date-fns');

class DateTimeService {
    constructor() {
        this.timeZone = 'America/Sao_Paulo'; // Default timezone
        this.utcTimeZone = 'UTC';
    }

    /**
     * Convert a date to the specified timezone
     * @param {Date|string} date - The date to convert
     * @param {string} [formatStr='yyyy-MM-dd HH:mm:ss'] - The output format
     * @param {string} [timeZone] - Target timezone (default: America/Sao_Paulo)
     * @returns {string} Formatted date string in the specified timezone
     */
    formatDate(date, formatStr = 'yyyy-MM-dd HH:mm:ss', timeZone = this.timeZone) {
        if (!date) return null;
        
        try {
            const dateObj = date instanceof Date ? date : parseISO(date);
            if (isNaN(dateObj.getTime())) {
                console.error('Invalid date:', date);
                return null;
            }
            return format(dateObj, formatStr, { timeZone });
        } catch (error) {
            console.error('Error formatting date:', error);
            return null;
        }
    }

    /**
     * Convert a local date to UTC
     * @param {Date|string} date - The date to convert
     * @param {string} [timeZone] - Source timezone (default: America/Sao_Paulo)
     * @returns {Date} Date in UTC
     */
    toUTC(date, timeZone = this.timeZone) {
        if (!date) return null;
        
        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            const zonedDate = utcToZonedTime(dateObj, timeZone);
            return zonedTimeToUtc(zonedDate, timeZone);
        } catch (error) {
            console.error('Error converting to UTC:', error);
            return null;
        }
    }

    /**
     * Convert a UTC date to local timezone
     * @param {Date|string} date - The UTC date to convert
     * @param {string} [timeZone] - Target timezone (default: America/Sao_Paulo)
     * @returns {Date} Date in the specified timezone
     */
    fromUTC(date, timeZone = this.timeZone) {
        if (!date) return null;
        
        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            return utcToZonedTime(dateObj, timeZone);
        } catch (error) {
            console.error('Error converting from UTC:', error);
            return null;
        }
    }

    /**
     * Get current date in the specified timezone
     * @param {string} [timeZone] - Target timezone (default: America/Sao_Paulo)
     * @returns {Date} Current date in the specified timezone
     */
    now(timeZone = this.timeZone) {
        return utcToZonedTime(new Date(), timeZone);
    }

    /**
     * Format a date to SQL datetime string
     * @param {Date|string} date - The date to format
     * @returns {string} Date in format 'YYYY-MM-DD HH:mm:ss'
     */
    toSQLDateTime(date) {
        if (!date) return null;
        return this.formatDate(date, 'yyyy-MM-dd HH:mm:ss', 'UTC');
    }
}

// Create a singleton instance
const dateTimeService = new DateTimeService();

module.exports = dateTimeService;
