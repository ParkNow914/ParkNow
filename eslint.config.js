// eslint.config.js — flat config (ESLint 9+)
// Migrado de .eslintrc.json/.eslintignore (removidos).

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
    {
        ignores: [
            'node_modules/',
            'coverage/',
            'logs/',
            'uploads/',
            'public/vendor/',
            'public/js/components/',
            'public/js/pages/',
            'dist/',
            'build/',
            '**/*.min.js',
        ],
    },

    js.configs.recommended,
    prettier,

    // Base: backend Node (CommonJS)
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2022,
                ...globals.jest,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': ['warn', { allow: ['error', 'warn'] }],
            'no-process-exit': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-useless-escape': 'warn',
            'no-async-promise-executor': 'warn',
            'no-case-declarations': 'off',
            'no-inner-declarations': 'off',
            'no-undef': 'warn',
            'no-dupe-keys': 'warn',
            'no-dupe-class-members': 'warn',
            'no-unreachable': 'warn',
        },
    },

    // Scripts utilitários podem usar console
    {
        files: ['scripts/**/*.js'],
        rules: { 'no-console': 'off' },
    },

    // Frontend (public/): browser + jQuery + globals de CDN
    {
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.jquery,
                L: 'readonly',
                io: 'readonly',
                flatpickr: 'readonly',
                React: 'readonly',
                ReactDOM: 'readonly',
                ReservaButton: 'readonly',
                ManualPixPaymentModal: 'readonly',
                google: 'readonly',
                Stripe: 'readonly',
            },
        },
    },
];
