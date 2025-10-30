const { setUserTimezone } = require('../utils/timezoneUtils');

function timezoneMiddleware(req, res, next) {
    // Get timezone from cookie, header, or default to America/Sao_Paulo
    const timezone = req.cookies.user_timezone || 
                    req.headers['x-timezone'] || 
                    'America/Sao_Paulo';
    
    // Set the timezone for this request
    setUserTimezone(timezone);
    
    // Add timezone to response locals
    res.locals.timezone = timezone;
    
    next();
}

module.exports = timezoneMiddleware;
