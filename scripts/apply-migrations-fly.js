#!/usr/bin/env node
// scripts/apply-migrations-fly.js
//
// Aplica o schema base (scripts/create-postgres-tables.sql) + todas as
// migrations incrementais (migrations/*.sql, em ordem alfabética) no banco
// configurado via env (PG_HOST/PG_USER/PG_PASSWORD/PG_DATABASE).
//
// Idempotente: erros isolados em cada arquivo não abortam o script (algumas
// migrations usam DO blocks que já testam IF NOT EXISTS, outras falham se
// já aplicadas — esperado).
//
// Uso (dentro do container):
//   node scripts/apply-migrations-fly.js
//
// Via Fly:
//   flyctl ssh console --app parknow-alimi -C "node /app/scripts/apply-migrations-fly.js"

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function resolveSsl() {
    const explicit = String(process.env.PG_SSL || '').toLowerCase();
    if (explicit === 'false' || explicit === '0') return false;
    if (explicit === 'true' || explicit === '1') return { rejectUnauthorized: false };
    return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

(async () => {
    const pool = new Pool({
        host: process.env.PG_HOST,
        port: parseInt(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        ssl: resolveSsl(),
        connectionTimeoutMillis: 15000,
    });

    let okCount = 0;
    let errCount = 0;

    async function runSql(filepath, label) {
        let sql;
        try {
            sql = fs.readFileSync(filepath, 'utf8');
        } catch (e) {
            console.log('SKIP  ' + label + ' :: file not found');
            return;
        }
        try {
            await pool.query(sql);
            okCount++;
            console.log('OK    ' + label);
        } catch (e) {
            errCount++;
            const msg = (e.message || String(e)).split('\n')[0];
            console.log('ERR   ' + label + ' :: ' + msg);
        }
    }

    const repoRoot = path.resolve(__dirname, '..');

    // 1) base schema
    await runSql(path.join(repoRoot, 'scripts', 'create-postgres-tables.sql'), 'base schema');

    // 2) migrations em ordem
    const migDir = path.join(repoRoot, 'migrations');
    if (fs.existsSync(migDir)) {
        const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
        for (const f of files) {
            await runSql(path.join(migDir, f), f);
        }
    } else {
        console.log('SKIP  migrations dir not found at ' + migDir);
    }

    await pool.end();
    console.log(`\nDone — ${okCount} ok, ${errCount} skipped/errors (some are expected if already applied).`);
    process.exit(0);
})().catch((e) => {
    console.error('FATAL: ' + (e.stack || e.message || e));
    process.exit(1);
});
