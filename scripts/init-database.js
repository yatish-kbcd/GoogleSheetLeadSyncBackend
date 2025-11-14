import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function initDatabase() {
  try {
    console.log('Starting database initialization...');
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_USER:', process.env.DB_USER);
    console.log('DB_NAME:', process.env.DB_NAME);

    // Create connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    console.log('Connected to MySQL database');

    // Create leads table
    const createLeadsTable = `
      CREATE TABLE IF NOT EXISTS leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        tech VARCHAR(255),
        first_round_feedback TEXT,
        first_round_status ENUM('pending', 'passed', 'failed', 'scheduled') DEFAULT 'pending',
        company VARCHAR(255),
        source VARCHAR(255),
        message TEXT,
        notes TEXT,
        status ENUM('new', 'contacted', 'qualified', 'converted', 'lost') DEFAULT 'new',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sync_date TIMESTAMP NULL,
        sheet_row_number INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    // Drop and recreate sync_history table with correct schema
    const dropSyncHistoryTable = `DROP TABLE IF EXISTS sync_history;`;

    const createSyncHistoryTable = `
      CREATE TABLE sync_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        spreadsheet_id VARCHAR(255) NOT NULL,
        total_records INT DEFAULT 0,
        created_count INT DEFAULT 0,
        updated_count INT DEFAULT 0,
        skipped_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        sync_type VARCHAR(50) DEFAULT 'manual',
        status VARCHAR(50) DEFAULT 'success',
        error_message TEXT,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Execute table creation
    await connection.execute(createLeadsTable);
    console.log('Leads table created or already exists');

    await connection.execute(dropSyncHistoryTable);
    console.log('Dropped existing sync_history table');

    await connection.execute(createSyncHistoryTable);
    console.log('Sync history table created with correct schema');

    // Close connection
    await connection.end();
    console.log('Database initialization completed successfully');

  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run database initialization
initDatabase();

export default initDatabase;
