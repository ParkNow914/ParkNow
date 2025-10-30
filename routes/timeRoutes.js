const express = require('express');
const router = express.Router();
const timeService = require('../services/timeService');

/**
 * @route   GET /api/time/current
 * @desc    Get current time based on client's IP
 * @access  Public
 */
router.get('/current', async (req, res) => {
    try {
        // Get client IP (considering proxy headers if present)
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        // Get timezone and current time for the client's location
        const timeData = await timeService.getClientTimezone(clientIp);
        
        res.json({
            success: true,
            timezone: timeData.timezone,
            currentTime: timeData.currentTime,
            offset: timeData.offset
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
 * @route   GET /api/time/timezone/:timezone
 * @desc    Get current time for a specific timezone
 * @access  Public
 */
router.get('/timezone/:timezone', async (req, res) => {
    try {
        const { timezone } = req.params;
        const timeData = await timeService.getCurrentTime(timezone);
        
        res.json({
            success: true,
            timezone: timeData.timezone,
            currentTime: timeData.currentTime
        });
    } catch (error) {
        console.error('Error getting time for timezone:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get time for timezone',
            error: error.message
        });
    }
});

module.exports = router;
