const { formatDate } = require('../utils/timezoneUtils');

/**
 * Middleware to format dates in API responses according to the user's timezone
 * This should be added after the timezone detection middleware
 */
const responseDateFormatter = (req, res, next) => {
    // Store the original json method
    const originalJson = res.json;
    
    // Override the json method to format dates before sending the response
    res.json = function(data) {
        // Only process if we have data and a timezone is set
        if (data && req.timezone) {
            // Process the data to format dates
            const formattedData = processObject(data, req.timezone);
            return originalJson.call(this, formattedData);
        }
        return originalJson.call(this, data);
    };
    
    next();
};

/**
 * Recursively process an object to format date fields
 * @param {*} obj - The object to process
 * @param {string} timezone - The target timezone
 * @returns {*} The processed object with formatted dates
 */
function processObject(obj, timezone) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => processObject(item, timezone));
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
        return formatDate(obj, timezone);
    }
    
    // Handle objects
    const result = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            
            // Check if the key indicates a date field (case-insensitive)
            const isDateField = /(date|time|hora|data|inicio|fim|saida|entrada|created|updated|deleted)/i.test(key);
            
            if (isDateField && value) {
                try {
                    // Try to parse the value as a date
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        result[key] = formatDate(date, timezone);
                        continue;
                    }
                } catch (_error) {
                    // If parsing fails, keep the original value (silencioso — roda em toda resposta)
                }
            }
            
            // Recursively process nested objects and arrays
            if (value && typeof value === 'object') {
                result[key] = processObject(value, timezone);
            } else {
                result[key] = value;
            }
        }
    }
    
    return result;
}

module.exports = responseDateFormatter;
