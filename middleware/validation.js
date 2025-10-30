const { z } = require('zod');

/**
 * Middleware to validate timezone in request parameters
 */
const validateTimeZone = (req, res, next) => {
    try {
        const schema = z.object({
            timezone: z.string().optional(),
            date: z.string().or(z.date()).optional(),
            format: z.string().optional(),
            fromTimeZone: z.string().optional(),
            toTimeZone: z.string().optional()
        });

        const validation = schema.safeParse({
            ...req.body,
            ...req.query,
            ...req.params
        });

        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validation.error.errors
            });
        }

        next();
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during validation',
            error: error.message
        });
    }
};

module.exports = {
    validateTimeZone
};
