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

    // Create kbcd_gst_sheet_connector table
    const createSheetConnectorTable = `
      CREATE TABLE IF NOT EXISTS kbcd_gst_sheet_connector (
        id INT AUTO_INCREMENT PRIMARY KEY,
        aid VARCHAR(255) NOT NULL,
        sheet_id VARCHAR(255) NOT NULL,
        sheet_name VARCHAR(255),
        emp_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_aid_sheet (aid, sheet_id)
      );
    `;

    // Note: sheet_name column is already in CREATE TABLE, so this alter may not be needed
    const addSheetNameColumn = ``;

    // Create kbcd_gst_field_mappings table
    const createFieldMappingsTable = `
      CREATE TABLE IF NOT EXISTS kbcd_gst_field_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        aid VARCHAR(255) NOT NULL,
        sheet_id VARCHAR(255) NOT NULL,
        sub_sheet_name VARCHAR(255) NOT NULL,
        cust_name VARCHAR(255),
        cust_phone_no VARCHAR(255),
        cust_email VARCHAR(255),
        source_name VARCHAR(255),
        city_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_aid_sheet_sub_mapping (aid, sheet_id, sub_sheet_name)
      );
    `;

    // Create kbcd_gst_all_leads table (renamed from leads)
    const createAllLeadsTable = `
      CREATE TABLE IF NOT EXISTS kbcd_gst_all_leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        aid VARCHAR(255) NOT NULL,
        spreadsheet_id VARCHAR(255) NOT NULL,
        sub_sheet_name VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        city VARCHAR(255),
        source VARCHAR(255),
        message TEXT,
        notes TEXT,
        status ENUM('new', 'contacted', 'qualified', 'converted', 'lost') DEFAULT 'new',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sync_date TIMESTAMP NULL,
        sheet_row_number INT NULL,
        process_status ENUM('success', 'failed') DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_aid_email (aid, sub_sheet_name, email)
      );
    `;

    // Create kbcd_gst_lead_sync_history table (renamed from sync_history)
    const createLeadSyncHistoryTable = `
      CREATE TABLE IF NOT EXISTS kbcd_gst_lead_sync_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        aid VARCHAR(255) NOT NULL,
        spreadsheet_id VARCHAR(255) NOT NULL,
        sub_sheet_name VARCHAR(255) NOT NULL,
        total_records INT DEFAULT 0,
        created_count INT DEFAULT 0,
        updated_count INT DEFAULT 0,
        skipped_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        sync_type VARCHAR(50) DEFAULT 'manual',
        status VARCHAR(50) DEFAULT 'success',
        error_message TEXT,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create kbcd_gst_failed_leads table
    const createFailedLeadsTable = `
      CREATE TABLE IF NOT EXISTS kbcd_gst_failed_leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        aid VARCHAR(255) NOT NULL,
        spreadsheet_id VARCHAR(255) NOT NULL,
        sub_sheet_name VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(20),
        city VARCHAR(255),
        source VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sheet_row_number INT NULL,
        reason VARCHAR(255) NOT NULL,
        data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_aid_sub_sheet (aid, sub_sheet_name)
      );
    `;

    // Execute table creation
    await connection.execute(createSheetConnectorTable);
    console.log('Sheet connector table created or already exists');

    if (addSheetNameColumn.trim()) {
      await connection.execute(addSheetNameColumn);
      console.log('Added sheet_name column to sheet connector table if not exists');
    } else {
      console.log('Skipping add sheet_name column');
    }

    await connection.execute(createFieldMappingsTable);
    console.log('Field mappings table created or already exists');

    // Try to alter the table for existing databases
    try {
      await connection.execute(`
        ALTER TABLE kbcd_gst_field_mappings ADD COLUMN sub_sheet_name VARCHAR(255) NOT NULL DEFAULT '' AFTER sheet_id
      `);
      console.log('Added sub_sheet_name column');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Add column warning:', error.message);
      } else {
        console.log('sub_sheet_name column already exists');
      }
    }

    try {
      await connection.execute(`
        ALTER TABLE kbcd_gst_field_mappings ADD UNIQUE KEY unique_aid_sheet_sub_mapping (aid, sheet_id, sub_sheet_name)
      `);
      console.log('Added new unique key');
    } catch (error) {
      if (error.code !== 'ER_DUP_KEYNAME') {
        console.warn('Add unique key warning:', error.message);
      } else {
        console.log('Unique key already exists');
      }
    }

    await connection.execute(createAllLeadsTable);
    console.log('All leads table created or already exists');

    await connection.execute(createLeadSyncHistoryTable);
    console.log('Lead sync history table created with correct schema');

    try {
      await connection.execute(`
        ALTER TABLE kbcd_gst_lead_sync_history ADD COLUMN failed_count INT DEFAULT 0 AFTER error_count
      `);
      console.log('Added failed_count column to lead sync history table');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') {
        console.warn('Add failed_count column warning:', error.message);
      } else {
        console.log('failed_count column already exists');
      }
    }

    await connection.execute(createFailedLeadsTable);
    console.log('Failed leads table created or already exists');

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
