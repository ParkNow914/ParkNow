/**
 * Form Date Handler for ParkNow
 * Handles date inputs and ensures consistent date parsing/formatting in forms
 */

class FormDateHandler {
    constructor() {
        this.initializeEventListeners();
    }

    /**
     * Initialize event listeners for date inputs
     */
    initializeEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            // Add input event listeners to all date/time inputs
            document.querySelectorAll('input[type="datetime-local"], input[type="date"], input[type="time"]').forEach(input => {
                input.addEventListener('change', this.handleDateInputChange.bind(this));
            });
            
            // Initialize any date pickers
            this.initializeDatePickers();
        });
    }

    /**
     * Initialize date picker libraries if available
     */
    initializeDatePickers() {
        // Check if Flatpickr is available
        if (typeof flatpickr !== 'undefined') {
            flatpickr("input[type='datetime-local'], input[type='date']", {
                enableTime: true,
                dateFormat: "Y-m-d H:i",
                time_24hr: true,
                locale: 'pt',
                // Add more options as needed
            });
        }
    }

    /**
     * Handle date input changes to ensure proper formatting
     * @param {Event} event - The input change event
     */
    handleDateInputChange(event) {
        const input = event.target;
        const value = input.value;
        
        if (!value) return;
        
        try {
            // Convert the input value to a Date object
            const date = new Date(value);
            
            // Validate the date
            if (isNaN(date.getTime())) {
                console.warn('Invalid date input:', value);
                input.setCustomValidity('Por favor, insira uma data e hora válidas.');
                return;
            }
            
            // Clear any previous validation message
            input.setCustomValidity('');
            
            // Format the date according to the input type
            let formattedValue;
            
            if (input.type === 'date') {
                formattedValue = date.toISOString().split('T')[0];
            } else if (input.type === 'time') {
                formattedValue = date.toTimeString().slice(0, 5);
            } else {
                // For datetime-local, format as YYYY-MM-DDThh:mm
                const pad = num => num.toString().padStart(2, '0');
                formattedValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
            }
            
            // Update the input value with the formatted date
            input.value = formattedValue;
            
        } catch (error) {
            console.error('Error processing date input:', error);
            input.setCustomValidity('Ocorreu um erro ao processar a data. Por favor, tente novamente.');
        }
    }

    /**
     * Parse a date string from form input
     * @param {string} dateString - The date string to parse
     * @param {string} timezone - The target timezone (defaults to browser's timezone)
     * @returns {Date} The parsed date in the specified timezone
     */
    static parseDateFromInput(dateString, _timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
        if (!dateString) return null;
        
        try {
            // Try to parse the date string as-is first
            let date = new Date(dateString);
            
            // If the date is invalid, try to parse it with the timezone
            if (isNaN(date.getTime())) {
                // Handle different date string formats
                if (dateString.includes('T') && dateString.includes('Z')) {
                    // ISO 8601 with timezone
                    date = new Date(dateString);
                } else if (dateString.includes('T')) {
                    // Local date-time without timezone (treat as local time)
                    date = new Date(dateString);
                } else {
                    // Just a date (set to start of day in local time)
                    date = new Date(dateString + 'T00:00:00');
                }
            }
            
            // If we still have an invalid date, throw an error
            if (isNaN(date.getTime())) {
                throw new Error(`Invalid date string: ${dateString}`);
            }
            
            return date;
            
        } catch (error) {
            console.error('Error parsing date:', error);
            throw new Error('Formato de data inválido. Use o formato YYYY-MM-DD ou YYYY-MM-DDTHH:MM');
        }
    }

    /**
     * Format a date for form input
     * @param {Date|string} date - The date to format
     * @param {string} type - The input type ('date', 'time', or 'datetime-local')
     * @returns {string} The formatted date string
     */
    static formatDateForInput(date, type = 'datetime-local') {
        if (!date) return '';
        
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        
        const pad = num => num.toString().padStart(2, '0');
        
        if (type === 'date') {
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        } else if (type === 'time') {
            return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            // datetime-local
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
    }
}

// Initialize FormDateHandler when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.formDateHandler = new FormDateHandler();
});
