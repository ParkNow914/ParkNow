// tests/setup.js
// Global Jest setup. Ensures tests run with a deterministic, non-production env
// and avoids touching real external services.

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.LOG_TO_FILE = 'false';

// Quiet down noisy logs during tests unless explicitly enabled.
if (!process.env.PARKNOW_TEST_VERBOSE) {
    // eslint-disable-next-line no-console
    console.debug = () => {};
}
