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

    // Frontend (public/): browser + jQuery + globals de CDN.
    // sourceType 'script' (clássico): é como os arquivos realmente rodam
    // (tags <script> sem type=module); em modo module o ESLint rejeitaria
    // padrões válidos de script clássico (ex.: function redeclarada).
    {
        files: ['public/**/*.js'],
        languageOptions: {
            sourceType: 'script',
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
                // expostos por admin-validators.js (carregado antes de script.js)
                validarCPF: 'readonly',
                validarCNPJ: 'readonly',
                formatarCNPJ: 'readonly',
                formatarCep: 'readonly',
            },
        },
    },

    // admin-validators.js DEFINE os globals declarados acima (é a origem deles)
    {
        files: ['public/admin_home/admin-validators.js'],
        rules: { 'no-redeclare': 'off' },
    },

    // Blocos inline extraídos do HTML legado: contêm funções redeclaradas
    // pré-existentes (válido em script clássico — a última vence). Mantido
    // como warning para rastrear sem bloquear; limpar é tarefa do ROADMAP.
    {
        files: ['public/**/*.inline-*.js'],
        rules: { 'no-redeclare': 'warn' },
    },
];
