const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '91827364Now#',
    database: process.env.PG_DATABASE || 'parknow_db'
});

function formatTable(rows, columns) {
    if (!rows.length) return 'No data found';
    
    // Get column widths
    const colWidths = {};
    columns.forEach(col => {
        colWidths[col] = Math.max(
            col.length,
            ...rows.map(row => String(row[col] || '').length)
        );
    });

    // Create header
    let output = '\n';
    columns.forEach(col => {
        output += col.padEnd(colWidths[col] + 2);
    });
    output += '\n' + '-'.repeat(columns.reduce((sum, col) => sum + colWidths[col] + 2, 0)) + '\n';

    // Add rows
    rows.forEach(row => {
        columns.forEach(col => {
            output += String(row[col] || '').padEnd(colWidths[col] + 2);
        });
        output += '\n';
    });

    return output;
}

async function checkDatabase() {
    const client = await pool.connect();
    try {
        console.log('\n=== Database Connection Test ===');
        await client.query('SELECT NOW()');
        console.log('✓ Connected to database successfully');
        
        // Check if reservas table exists
        const tableExists = await client.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'reservas')`
        );
        
        if (!tableExists.rows[0].exists) {
            console.log('\n❌ Error: "reservas" table does not exist');
            return;
        }
        
        // Get table structure
        console.log('\n=== Table: reservas ===');
        const columns = await client.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default,
                character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'reservas'
            ORDER BY ordinal_position;
        `);
        
        console.log(formatTable(columns.rows, ['column_name', 'data_type', 'is_nullable']));
        
        // Check for required indexes
        console.log('\n=== Indexes ===');
        const indexes = await client.query(`
            SELECT 
                i.relname as index_name,
                a.attname as column_name,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary
            FROM 
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_attribute a
            WHERE 
                t.oid = ix.indrelid
                AND i.oid = ix.indexrelid
                AND a.attrelid = t.oid
                AND a.attnum = ANY(ix.indkey)
                AND t.relkind = 'r'
                AND t.relname = 'reservas'
            ORDER BY 
                t.relname,
                i.relname;
        `);
        
        console.log(indexes.rows.length ? formatTable(indexes.rows, ['index_name', 'column_name', 'is_unique', 'is_primary']) : 'No indexes found');
        
        // Check for foreign keys
        console.log('\n=== Foreign Keys ===');
        const fks = await client.query(`
            SELECT
                tc.constraint_name,
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                    ON ccu.constraint_name = tc.constraint_name
                    AND ccu.table_schema = tc.table_schema
            WHERE 
                tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_name = 'reservas';
        `);
        
        console.log(fks.rows.length ? formatTable(fks.rows, ['constraint_name', 'column_name', 'foreign_table_name', 'foreign_column_name']) : 'No foreign keys found');
        
    } catch (error) {
        console.error('\n❌ Database error:', error.message);
        if (error.code) console.error('Error code:', error.code);
    } finally {
        client.release();
        await pool.end();
    }
}

console.log('Starting database check...');
checkDatabase().catch(console.error);
