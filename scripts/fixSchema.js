const { pool } = require('../utils/dbUtils');
const logger = require('../utils/logger');

async function fixSchema() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        logger.info('Starting database schema fix...');
        
        // 1. Add created_at column if it doesn't exist
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'vagas' AND column_name = 'created_at'
                ) THEN
                    ALTER TABLE vagas 
                    ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL;
                    
                    UPDATE vagas 
                    SET created_at = CURRENT_TIMESTAMP 
                    WHERE created_at IS NULL;
                    
                    RAISE NOTICE 'Added created_at column to vagas table';
                ELSE
                    RAISE NOTICE 'created_at column already exists in vagas table';
                END IF;
            END $$;
        `);
        
        // 2. Add updated_at column and trigger if they don't exist
        await client.query(`
            DO $$
            BEGIN
                -- Add updated_at column if it doesn't exist
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'vagas' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE vagas 
                    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL;
                    
                    UPDATE vagas 
                    SET updated_at = CURRENT_TIMESTAMP 
                    WHERE updated_at IS NULL;
                    
                    RAISE NOTICE 'Added updated_at column to vagas table';
                ELSE
                    RAISE NOTICE 'updated_at column already exists in vagas table';
                END IF;
                
                -- Create or replace the update function
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;
                
                -- Create trigger if it doesn't exist
                IF NOT EXISTS (
                    SELECT 1 
                    FROM pg_trigger 
                    WHERE tgname = 'update_vagas_updated_at'
                ) THEN
                    CREATE TRIGGER update_vagas_updated_at
                    BEFORE UPDATE ON vagas
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                    
                    RAISE NOTICE 'Created update_vagas_updated_at trigger';
                ELSE
                    RAISE NOTICE 'update_vagas_updated_at trigger already exists';
                END IF;
            END $$;
        `);
        
        await client.query('COMMIT');
        logger.info('Database schema fix completed successfully');
        
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error fixing database schema:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run the function
fixSchema()
    .then(() => {
        console.log('Script completed successfully');
        process.exit(0);
    })
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    });
