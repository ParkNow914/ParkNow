#!/usr/bin/env node
// scripts/migrate.js
//
// Runner de migrations REAL com tabela de controle `schema_migrations`.
// Substitui o antigo run-migration.js (que aplicava 1 arquivo hardcoded) e o
// apply-migrations-fly.js (que re-rodava tudo toda vez).
//
// Comportamento:
//   1. Cria a tabela schema_migrations se não existir.
//   2. Se o schema base ainda não foi aplicado (tabela `usuarios` ausente),
//      aplica scripts/create-postgres-tables.sql como baseline "000_baseline".
//   3. Aplica, em ordem alfabética, cada migrations/*.sql que ainda NÃO está
//      registrada — cada uma em sua própria transação — e registra com checksum.
//
// Flags:
//   --strict   aborta no primeiro erro (use com migrations limpas).
//              Sem --strict (default), loga o erro, NÃO registra a migration
//              e continua (tolerante ao legado com migrations interdependentes).
//   --status   apenas lista o que está aplicado x pendente e sai.
//
// Uso:
//   node scripts/migrate.js
//   node scripts/migrate.js --status
//   node scripts/migrate.js --strict
//   flyctl ssh console -a parknow-alimi -C "node /app/scripts/migrate.js"

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

function resolveSsl() {
    const explicit = String(process.env.PG_SSL || '').toLowerCase();
    if (explicit === 'false' || explicit === '0') return false;
    if (explicit === 'true' || explicit === '1') return { rejectUnauthorized: false };
    return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

const STRICT = process.argv.includes('--strict');
const STATUS_ONLY = process.argv.includes('--status');

const repoRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const baselineFile = path.join(repoRoot, 'scripts', 'create-postgres-tables.sql');

// Migrations legadas que NUNCA aplicam limpo no schema atual: foram escritas
// para um estado antigo do banco (referenciam tabela `migrations`, colunas
// pré-rename ou campos Stripe já removidos). O schema atual já contém tudo o
// que importa via baseline + outras migrations. Registramos como "obsoleta"
// para parar de tentá-las a cada run (sem poluir o log).
const OBSOLETE = new Set([
    '20240620_add_payment_columns_to_reservas.sql',
    '20240620_add_payment_methods_to_estacionamentos.sql',
    '20240623_02_add_updated_at_to_vagas.sql',
    '20240627_rename_id_reserva_to_reserva_id.sql',
    '20251104_create_notificacoes_table.sql',
    '20251107_183402_add_stripe_connect_fields.sql',
]);

function checksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function log(level, msg) {
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log(`${ts} [migrate:${level}] ${msg}`);
}

async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     VARCHAR(255) PRIMARY KEY,
            checksum    VARCHAR(64),
            applied_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    `);
}

async function getApplied(pool) {
    const { rows } = await pool.query('SELECT version FROM schema_migrations');
    return new Set(rows.map((r) => r.version));
}

async function tableExists(pool, table) {
    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [table]
    );
    return rows[0].exists;
}

async function applyOne(pool, version, sql) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
            'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
            [version, checksum(sql)]
        );
        await client.query('COMMIT');
        log('ok', version);
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        const msg = (err.message || String(err)).split('\n')[0];
        if (STRICT) {
            log('FAIL', `${version} :: ${msg}`);
            throw err;
        }
        log('warn', `${version} :: ${msg} (pulando — não registrada)`);
        return false;
    } finally {
        client.release();
    }
}

async function main() {
    const pool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
        database: process.env.PG_DATABASE || 'parknow_db',
        ssl: resolveSsl(),
        connectionTimeoutMillis: 15000,
    });

    try {
        await ensureMigrationsTable(pool);
        const applied = await getApplied(pool);

        // Lista de migrations disponíveis (.sql apenas — os .js legados Sequelize
        // não são suportados por este runner; foram consolidados).
        const files = fs.existsSync(migrationsDir)
            ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
            : [];

        // Baseline implícito
        const baselineVersion = '000_baseline';
        const needBaseline = !applied.has(baselineVersion) && !(await tableExists(pool, 'usuarios'));

        if (STATUS_ONLY) {
            log('info', `Aplicadas: ${applied.size}`);
            const pending = files.filter((f) => !applied.has(f));
            log('info', `Baseline aplicado: ${applied.has(baselineVersion) || (await tableExists(pool, 'usuarios'))}`);
            log('info', `Pendentes: ${pending.length}${pending.length ? ' -> ' + pending.join(', ') : ''}`);
            await pool.end();
            return;
        }

        let okCount = 0;
        let skipCount = 0;

        if (needBaseline && fs.existsSync(baselineFile)) {
            const sql = fs.readFileSync(baselineFile, 'utf8');
            const done = await applyOne(pool, baselineVersion, sql);
            done ? okCount++ : skipCount++;
        } else if (!applied.has(baselineVersion)) {
            // Banco já tinha schema (ex: produção). Marca baseline como aplicado.
            await pool.query(
                'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [baselineVersion, 'preexisting']
            );
            log('info', 'baseline marcado como pré-existente (schema já estava no banco)');
        }

        for (const f of files) {
            if (applied.has(f)) continue;
            if (OBSOLETE.has(f)) {
                await pool.query(
                    'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [f, 'obsolete-skipped']
                );
                log('info', `${f} :: obsoleta (registrada como skipped, não aplicada)`);
                skipCount++;
                continue;
            }
            const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
            const done = await applyOne(pool, f, sql);
            done ? okCount++ : skipCount++;
        }

        log('info', `Concluído — ${okCount} aplicadas, ${skipCount} puladas/erros.`);
        await pool.end();
    } catch (err) {
        log('FATAL', err.stack || err.message || String(err));
        await pool.end().catch(() => {});
        process.exit(1);
    }
}

main();
