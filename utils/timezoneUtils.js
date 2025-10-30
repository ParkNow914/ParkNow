const moment = require('moment-timezone');

// Default timezone (will be overridden by user's timezone)
let userTimezone = 'America/Sao_Paulo';

// Set user's timezone (to be called from frontend)
function setUserTimezone(timezone) {
    if (moment.tz.zone(timezone)) {
        userTimezone = timezone;
    }
}

// Get current date in user's timezone
function now() {
    return moment().tz(userTimezone);
}

// Convert UTC date to user's timezone
function toUserTimezone(date) {
    if (!date) return null;
    return moment.utc(date).tz(userTimezone);
}

// Format date for display
function formatDate(date, format = 'DD/MM/YYYY HH:mm') {
    if (!date) return 'N/A';
    return toUserTimezone(date).format(format);
}

// Parse date from user's timezone to UTC
function parseToUTC(dateString, format = 'DD/MM/YYYY HH:mm') {
    return moment.tz(dateString, format, userTimezone).utc().toDate();
}

module.exports = {
    setUserTimezone,
    now,
    toUserTimezone,
    formatDate,
    parseToUTC,
    userTimezone: () => userTimezone
};
