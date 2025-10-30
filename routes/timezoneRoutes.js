const express = require('express');
const router = express.Router();
const dateTimeService = require('../utils/dateTimeService');
const { validateTimeZone } = require('../middleware/validation');

/**
 * @route   POST /api/timezone
 * @desc    Sync client timezone with server
 * @access  Public
 */
router.post('/', (req, res) => {
    try {
        const timeZone = req.headers['x-timezone'] || req.body.timezone || 'America/Sao_Paulo';
        
        // Here you could store the timezone in the user's session or database if needed
        // For now, we'll just acknowledge the timezone
        
        res.json({
            success: true,
            timeZone,
            message: 'Timezone synchronized successfully'
        });
    } catch (error) {
        console.error('Error syncing timezone:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync timezone',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/timezone/current
 * @desc    Get current time in the specified timezone
 * @access  Public
 */
router.get('/current', (req, res) => {
    try {
        const timeZone = req.query.timezone || 'America/Sao_Paulo';
        const now = dateTimeService.now(timeZone);
        const formattedDate = dateTimeService.formatDate(now, 'yyyy-MM-dd HH:mm:ss', timeZone);
        
        res.json({
            success: true,
            timeZone,
            currentTime: formattedDate,
            timestamp: now.getTime(),
            isoString: now.toISOString()
        });
    } catch (error) {
        console.error('Error getting current time:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get current time',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/timezone/convert
 * @desc    Convert a date between timezones
 * @access  Public
 */
router.post('/convert', validateTimeZone, (req, res) => {
    try {
        const { date, fromTimeZone = 'UTC', toTimeZone = 'America/Sao_Paulo', format = 'yyyy-MM-dd HH:mm:ss' } = req.body;
        
        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date is required'
            });
        }

        const convertedDate = dateTimeService.formatDate(new Date(date), format, toTimeZone);
        
        res.json({
            success: true,
            originalDate: date,
            fromTimeZone,
            toTimeZone,
            convertedDate,
            format
        });
    } catch (error) {
        console.error('Error converting timezone:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to convert timezone',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/timezone/list
 * @desc    Get list of supported timezones
 * @access  Public
 */
router.get('/list', (req, res) => {
    try {
        // Lista de timezones suportadas (pode ser expandida conforme necessário)
        const timezones = [
            'America/Sao_Paulo',
            'America/New_York',
            'America/Los_Angeles',
            'Europe/London',
            'Europe/Paris',
            'Asia/Tokyo',
            'Australia/Sydney'
            // Adicione mais timezones conforme necessário
        ];
        
        res.json({
            success: true,
            timezones
        });
    } catch (error) {
        console.error('Error getting timezone list:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get timezone list',
            error: error.message
        });
    }
});

module.exports = router;
