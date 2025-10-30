const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');

async function fixVagasSchema() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Add created_at column if it doesn't exist
        const checkCreatedAt = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'vagas' AND column_name = 'created_at';
        `);
        
        if (checkCreatedAt.rows.length === 0) {
            logger.info('Adding created_at column to vagas table...');
            await client.query(`
                ALTER TABLE vagas 
                ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                
                UPDATE vagas 
                SET created_at = CURRENT_TIMESTAMP 
                WHERE created_at IS NULL;
                
                ALTER TABLE vagas 
                ALTER COLUMN created_at SET NOT NULL;
            `);
            logger.info('Successfully added created_at column to vagas table');
        } else {
            logger.info('created_at column already exists in vagas table');
        }
        
        // 2. Add updated_at column if it doesn't exist
        const checkUpdatedAt = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'vagas' AND column_name = 'updated_at';
        `);
        
        if (checkUpdatedAt.rows.length === 0) {
            logger.info('Adding updated_at column to vagas table...');
            await client.query(`
                ALTER TABLE vagas 
                ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                
                UPDATE vagas 
                SET updated_at = CURRENT_TIMESTAMP 
                WHERE updated_at IS NULL;
                
                ALTER TABLE vagas 
                ALTER COLUMN updated_at SET NOT NULL;
            `);
            logger.info('Successfully added updated_at column to vagas table');
        } else {
            logger.info('updated_at column already exists in vagas table');
        }
        
        // 3. Create or replace the update function
        logger.info('Creating or updating update_updated_at_column function...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        
        // 4. Create trigger if it doesn't exist
        const checkTrigger = await client.query(`
            SELECT 1 
            FROM pg_trigger 
            WHERE tgname = 'update_vagas_updated_at';
        `);
        
        if (checkTrigger.rows.length === 0) {
            logger.info('Creating update_vagas_updated_at trigger...');
            await client.query(`
                CREATE TRIGGER update_vagas_updated_at
                BEFORE UPDATE ON vagas
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
            `);
            logger.info('Successfully created update_vagas_updated_at trigger');
        } else {
            logger.info('update_vagas_updated_at trigger already exists');
        }
        
        await client.query('COMMIT');
        logger.info('Database schema update completed successfully');
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error updating database schema:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the function
fixVagasSchema()
    .then(() => {
        console.log('Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
