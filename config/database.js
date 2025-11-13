// config/database.js
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config();

let pool;

export function createPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

export async function testConnection() {
  try {
    const connection = await getConnection();
    console.log('✅ MySQL database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    throw error;
  }
}

export function getConnection() {
  const pool = createPool();
  return pool.getConnection();
}

export async function query(sql, params = []) {
  const pool = createPool();
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}