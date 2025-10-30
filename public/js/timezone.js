/**
 * Timezone Utility for ParkNow
 * Handles timezone detection and synchronization with the server
 */

class TimezoneManager {
    constructor() {
        this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        this.updateInterval = 24 * 60 * 60 * 1000; // Update timezone once per day
        this.initialize();
    }

    /**
     * Initialize the timezone manager
     */
    async initialize() {
        await this.syncWithServer();
        this.scheduleNextSync();
        this.setupEventListeners();
    }

    /**
     * Sync the browser's timezone with the server
     */
    async syncWithServer() {
        try {
            const response = await fetch('/api/timezone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Timezone': this.timezone
                },
                body: JSON.stringify({ timezone: this.timezone })
            });

            if (!response.ok) {
                throw new Error('Failed to sync timezone with server');
            }

            const data = await response.json();
            if (data.success) {
                this.dispatchTimezoneChanged();
            }
        } catch (error) {
            console.error('Error syncing timezone:', error);
            // Retry after a short delay
            setTimeout(() => this.syncWithServer(), 30000);
        }
    }

    /**
     * Schedule the next timezone sync
     */
    scheduleNextSync() {
        setTimeout(() => {
            this.syncWithServer();
            this.scheduleNextSync();
        }, this.updateInterval);
    }

    /**
     * Setup event listeners for timezone changes
     */
    setupEventListeners() {
        // Listen for visibility changes to detect timezone changes when user returns to the tab
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkForTimezoneChange();
            }
        });
    }

    /**
     * Check if the timezone has changed and update if necessary
     */
    checkForTimezoneChange() {
        const newTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (newTimezone !== this.timezone) {
            this.timezone = newTimezone;
            this.syncWithServer();
        }
    }

    /**
     * Dispatch an event when the timezone changes
     */
    dispatchTimezoneChanged() {
        const event = new CustomEvent('timezoneChanged', {
            detail: { timezone: this.timezone }
        });
        window.dispatchEvent(event);
    }

    /**
     * Format a date in the user's local timezone
     * @param {Date|string} date - The date to format
     * @param {Object} options - Formatting options
     * @returns {string} Formatted date string
     */
    formatDate(date, options = {}) {
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
        return new Intl.DateTimeFormat(navigator.language, mergedOptions).format(new Date(date));
    }

    /**
     * Get the current timezone
     * @returns {string} The current timezone
     */
    getCurrentTimezone() {
        return this.timezone;
    }
}

// Initialize Timezone Manager when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.timezoneManager = new TimezoneManager();
});
