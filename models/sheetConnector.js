// models/sheetConnector.js
import { query } from '../config/database.js';

export async function createSheetConnector(aid, sheetId) {
  const sql = `
    INSERT INTO kbcd_gst_sheet_connector
    (aid, sheet_id)
    VALUES (?, ?)
  `;

  const result = await query(sql, [aid, sheetId]);
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
