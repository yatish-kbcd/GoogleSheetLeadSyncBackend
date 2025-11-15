// models/sheetConnector.js
import { query } from '../config/database.js';
import { createPool } from '../config/database.js';

export async function createSheetConnector(aid, sheetId, sheetName = null, empId = null) {
  const sql = `
    INSERT INTO kbcd_gst_sheet_connector
    (aid, sheet_id, sheet_name, emp_id)
    VALUES (?, ?, ?, ?)
  `;

  const result = await query(sql, [aid, sheetId, sheetName, empId]);
  return result.insertId;
}

export async function getSheetConnectorsByAid(aid) {
  const sql = `SELECT * FROM kbcd_gst_sheet_connector WHERE aid = ?`;
  return await query(sql, [aid]);
}

export async function getSheetConnector(aid, sheetId) {
  const sql = `SELECT * FROM kbcd_gst_sheet_connector WHERE aid = ? AND sheet_id = ?`;
  const rows = await query(sql, [aid, sheetId]);
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteSheetConnector(aid, sheetId) {
  const sql = `DELETE FROM kbcd_gst_sheet_connector WHERE aid = ? AND sheet_id = ?`;
  const result = await query(sql, [aid, sheetId]);
  return result.affectedRows > 0;
}

// Delete connector and related field mappings
export async function deleteSheetConnectorWithMappings(aid, sheetId) {
  const pool = createPool();
  const connection = await pool.getConnection();

  try {
    // Start a transaction to ensure data consistency
    await connection.beginTransaction();

    // Delete field mappings first
    await connection.execute(
      `DELETE FROM kbcd_gst_field_mappings WHERE aid = ? AND sheet_id = ?`,
      [aid, sheetId]
    );

    // Delete the connector
    const [result] = await connection.execute(
      `DELETE FROM kbcd_gst_sheet_connector WHERE aid = ? AND sheet_id = ?`,
      [aid, sheetId]
    );

    // Commit the transaction
    await connection.commit();

    return result.affectedRows > 0;
  } catch (error) {
    // Rollback on error
    await connection.rollback();
    console.error('Transaction rolled back:', error);
    throw error;
  } finally {
    connection.release();
  }
}
