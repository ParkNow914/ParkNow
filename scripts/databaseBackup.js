require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const cron = require('node-cron');
const { createLogger, format, transports } = require('winston');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Configure logger
const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    defaultMeta: { service: 'database-backup' },
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.simple()
            )
        }),
        new transports.File({ 
            filename: path.join(__dirname, '../logs/backup-error.log'), 
            level: 'error' 
        }),
        new transports.File({ 
            filename: path.join(__dirname, '../logs/backup-combined.log') 
        })
    ]
});

// Ensure directories exist
const ensureDirectories = () => {
    const backupDir = path.join(__dirname, '../backups');
    const logsDir = path.join(__dirname, '../logs');
    
    [backupDir, logsDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    
    return { backupDir, logsDir };
};

const { backupDir } = ensureDirectories();

// Database configuration
const dbConfig = {
    user: process.env.PG_USER || 'postgres',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'parknow_db',
    password: process.env.PG_PASSWORD || '91827364Now#',
    port: process.env.PG_PORT || 5432,
};

// Create backup function
const createBackup = async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.sql`;
    const backupPath = path.join(backupDir, backupFileName);
    
    logger.info(`Starting backup: ${backupFileName}`);
    
    try {
        // Use pg_dump command directly
        const command = `"C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump" -U ${dbConfig.user} -h ${dbConfig.host} -p ${dbConfig.port} -d ${dbConfig.database} -f "${backupPath}" -F p -b -v`;
        
        // Execute the command with the password from environment
        const env = { ...process.env, PGPASSWORD: dbConfig.password };
        const { stdout, stderr } = await execPromise(command, { env });
        
        if (stderr) {
            logger.warn(`pg_dump stderr: ${stderr}`);
        }
        
        logger.info(`Backup completed successfully: ${backupFileName}`);
        cleanupOldBackups();
        return { success: true, file: backupFileName };
    } catch (error) {
        logger.error(`Backup failed: ${error.message}`, { 
            error: error.message,
            stderr: error.stderr,
            stdout: error.stdout 
        });
        return { 
            success: false, 
            error: error.message,
            stderr: error.stderr,
            stdout: error.stdout
        };
    }
};

// Clean up old backups
const cleanupOldBackups = () => {
    try {
        const files = fs.readdirSync(backupDir);
        const backupFiles = files
            .filter(file => file.startsWith('backup-') && file.endsWith('.sql'))
            .sort()
            .reverse()
            .slice(10); // Keep only the 10 most recent backups
        
        backupFiles.forEach(file => {
            const filePath = path.join(backupDir, file);
            try {
                fs.unlinkSync(filePath);
                logger.info(`Deleted old backup: ${file}`);
            } catch (err) {
                logger.error(`Error deleting old backup ${file}: ${err.message}`);
            }
        });
    } catch (err) {
        logger.error(`Error cleaning up old backups: ${err.message}`);
    }
};

// Create Windows service
const createWindowsService = () => {
    const { Service } = require('node-windows');
    const svc = new Service({
        name: 'ParkNowDBBackup',
        description: 'Backup automático do banco de dados ParkNow',
        script: path.join(__dirname, 'databaseBackup.js'),
        nodeOptions: [
            '--harmony',
            '--max_old_space_size=4096'
        ]
    });

    svc.on('install', () => {
        logger.info('Service installed');
        svc.start();
    });

    svc.on('start', () => {
        logger.info('Service started');
    });

    svc.on('error', (err) => {
        logger.error('Service error:', err);
    });

    return svc;
};

// Main function
const main = () => {
    // Initial backup
    createBackup();
    
    // Schedule backups every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        logger.info('Scheduled backup starting...');
        createBackup();
    });

    logger.info('Backup service started');
};

// Handle command line arguments
if (process.argv.includes('--install-service')) {
    const svc = createWindowsService();
    svc.install();
} else if (process.argv.includes('--uninstall-service')) {
    const svc = createWindowsService();
    svc.uninstall();
} else {
    main();
}

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Backup service stopped');
    process.exit(0);
});

module.exports = { createBackup };
cron.schedule('*/5 * * * *', () => {
    logger.info('Scheduled backup starting...');
    createBackup();
});

// Initial backup on startup
logger.info('Backup service started');
createBackup();

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Backup service stopped');
    process.exit(0);
});
