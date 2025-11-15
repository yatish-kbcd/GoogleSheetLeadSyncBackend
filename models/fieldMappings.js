// models/fieldMappings.js
import { query } from '../config/database.js';

export async function createOrUpdateFieldMapping(aid, sheetId, mapping) {
  const {
    cust_name,
    cust_phone_no,
    cust_email,
    source_name,
    city_name
  } = mapping;

  // Use INSERT ... ON DUPLICATE KEY UPDATE for upsert
  const sql = `
    INSERT INTO kbcd_gst_field_mappings
    (aid, sheet_id, cust_name, cust_phone_no, cust_email, source_name, city_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      cust_name = VALUES(cust_name),
      cust_phone_no = VALUES(cust_phone_no),
      cust_email = VALUES(cust_email),
      source_name = VALUES(source_name),
      city_name = VALUES(city_name),
      updated_at = CURRENT_TIMESTAMP
  `;

  const result = await query(sql, [
    aid, sheetId,
    cust_name || null,
    cust_phone_no || null,
    cust_email || null,
    source_name || null,
    city_name || null
  ]);

  return result.insertId || result.affectedRows;
}

export async function getFieldMapping(aid, sheetId) {
  const sql = `SELECT * FROM kbcd_gst_field_mappings WHERE aid = ? AND sheet_id = ?`;
  const rows = await query(sql, [aid, sheetId]);
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteFieldMapping(aid, sheetId) {
  const sql = `DELETE FROM kbcd_gst_field_mappings WHERE aid = ? AND sheet_id = ?`;
  const result = await query(sql, [aid, sheetId]);
  return result.affectedRows > 0;
}
