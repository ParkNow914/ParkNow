// utils/errorTracker.js
//
// Thin, dependency-free error-tracking facade. The goal is to let the rest
// of the codebase report errors through a stable API today and plug in
// Sentry / Datadog / Bugsnag later without changing call sites.
//
// If a project later installs `@sentry/node` and sets SENTRY_DSN, this
// module will detect the package, initialize it, and forward events. When
// the package isn't installed we simply log to Winston — no extra deps.

const logger = require('./logger');

let sentry = null;
let initialized = false;
let enabled = false;

function init() {
    if (initialized) return;
    initialized = true;

    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
        logger.info('[errorTracker] SENTRY_DSN unset; error tracking disabled (logger fallback active)');
        return;
    }

    try {
        // Optional dependency: only loaded when configured. The require is
        // wrapped so missing module isn't fatal.
        // eslint-disable-next-line global-require
        sentry = require('@sentry/node');
        sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            release: process.env.APP_RELEASE,
            tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
        });
        enabled = true;
        logger.info('[errorTracker] Sentry initialized');
    } catch (err) {
        logger.warn('[errorTracker] SENTRY_DSN set but @sentry/node not installed; falling back to logger', {
            error: err.message,
        });
    }
}

function captureException(err, context = {}) {
    if (!initialized) init();
    if (enabled && sentry) {
        try {
            sentry.withScope((scope) => {
                Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
                sentry.captureException(err);
            });
            return;
        } catch (forwardErr) {
            // Fall through to logger if Sentry itself fails.
            logger.warn('[errorTracker] failed to forward to Sentry', { error: forwardErr.message });
        }
    }
    logger.error('[errorTracker] exception', { error: err?.message, stack: err?.stack, ...context });
}

function captureMessage(message, level = 'info', context = {}) {
    if (!initialized) init();
    if (enabled && sentry) {
        try {
            sentry.withScope((scope) => {
                Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
                sentry.captureMessage(message, level);
            });
            return;
        } catch (forwardErr) {
            logger.warn('[errorTracker] failed to forward message to Sentry', { error: forwardErr.message });
        }
    }
    logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info']('[errorTracker]', { message, ...context });
}

module.exports = { init, captureException, captureMessage };
