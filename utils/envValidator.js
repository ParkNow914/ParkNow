// utils/envValidator.js
// Validates required environment variables at startup using zod.
// Fails fast in production if mandatory values are missing or insecure.

const { z } = require('zod');

const isProduction = process.env.NODE_ENV === 'production';

// In production we require real secrets >= 32 chars.
// In development we still accept defaults but emit a warning via the logger.
const secretSchema = isProduction
    ? z.string().min(32, 'Must be at least 32 characters in production')
    : z.string().min(1).optional();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : 3000))
        .pipe(z.number().int().positive()),

    // Database
    PG_HOST: z.string().min(1).default('localhost'),
    PG_PORT: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v, 10) : 5432))
        .pipe(z.number().int().positive()),
    PG_USER: z.string().min(1).default('postgres'),
    PG_PASSWORD: isProduction ? z.string().min(1, 'PG_PASSWORD is required in production') : z.string().optional(),
    PG_DATABASE: z.string().min(1).default('parknow_db'),

    // JWT secrets
    JWT_SECRET: secretSchema,
    JWT_REFRESH_SECRET: secretSchema,

    // Optional/loose
    FRONTEND_URL: z.string().url().optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).optional(),
});

/**
 * Validate process.env and return a plain object with parsed/typed values.
 * Throws AggregateError-style detailed message on failure (production) or
 * logs warnings and returns best-effort values (development).
 *
 * @param {object} [logger] Optional logger (Winston-like). Falls back to console.
 * @returns {object} validated env values
 */
function validateEnv(logger = console) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
        const message = `Environment validation failed:\n${issues.join('\n')}`;

        if (isProduction) {
            logger.error(message);
            // Hard fail in production: never start with bad config.
            throw new Error('Invalid environment configuration. See logs for details.');
        }
        // Development: warn but allow startup so contributors can iterate.
        logger.warn(message);
        logger.warn('Continuing in non-production mode with partial environment.');
        return process.env;
    }

    return result.data;
}

module.exports = { validateEnv, envSchema };
