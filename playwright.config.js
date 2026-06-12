// playwright.config.js
// E2E contra o servidor REAL (node server.js) + Postgres real.
// Roda no CI (job e2e em ci.yml); localmente: npm run test:e2e
// (requer Postgres acessível com as PG_* do ambiente e browsers instalados:
//  npx playwright install chromium)

const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3999;

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    fullyParallel: false, // compartilham o mesmo banco/estado
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? [['list'], ['github']] : [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'node server.js',
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
        env: {
            ...process.env,
            NODE_ENV: 'development', // landing/anexos servidos; secure cookies off
            PORT: String(PORT),
            LOG_LEVEL: 'error',
            JWT_SECRET: process.env.JWT_SECRET || 'e2e_jwt_secret_0123456789abcdef0123456789',
            JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'e2e_refresh_0123456789abcdef0123456789ab',
        },
    },
});
