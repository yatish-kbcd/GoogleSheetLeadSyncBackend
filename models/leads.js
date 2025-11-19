// models/leads.js
import { query } from '../config/database.js';

export async function createLead(aid, leadData) {
  // console.log("line 5",leadData);

  const {
    spreadsheet_id,
    sub_sheet_name,
    name,
    email,
    phone,
    city,
    source = 'Google Sheet',
    message,
    notes,
    status = 'new',
    timestamp,
    sheetRowNumber
  } = leadData;

  const sql = `
    INSERT INTO kbcd_gst_all_leads
    (aid, spreadsheet_id, sub_sheet_name, name, email, phone, city, source, message, notes, status, timestamp, sheet_row_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    aid,
    spreadsheet_id,
    sub_sheet_name,
    name || null,
    email.toLowerCase(),
    phone || null,
    city || null,
    source,
    message || null,
    notes || null,
    status,
    timestamp ? new Date(timestamp) : new Date(),
    sheetRowNumber || null
  ];

  try {
    const result = await query(sql, params);
    return { id: result.insertId, ...leadData };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('DUPLICATE_LEAD');
    }
    throw error;
  }
}

export async function findLeadByEmailAndTimestamp(aid, email, timestamp) {
  const sql = `
    SELECT * FROM kbcd_gst_all_leads
    WHERE aid = ? AND email = ? AND timestamp = ?
  `;

  const rows = await query(sql, [aid, email.toLowerCase(), new Date(timestamp)]);
  return rows.length > 0 ? rows[0] : null;
}

export async function findLeadByEmail(aid, sub_sheet_name, email) {
  const sql = `SELECT * FROM kbcd_gst_all_leads WHERE aid = ? AND sub_sheet_name = ? AND email = ?`;
  const rows = await query(sql, [aid, sub_sheet_name, email.toLowerCase()]);
  return rows.length > 0 ? rows[0] : null;
}

export async function updateLead(aid, id, leadData) {
  const fields = [];
  const values = [];

  Object.keys(leadData).forEach(key => {
    if (leadData[key] !== undefined) {
      fields.push(`${key} = ?`);

      if (key === 'email') {
        values.push(leadData[key].toLowerCase());
      } else {
        values.push(leadData[key]);
      }
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(aid, id);

  const sql = `
    UPDATE kbcd_gst_all_leads
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE aid = ? AND id = ?
  `;

  const result = await query(sql, values);
  return result.affectedRows > 0;
}

export async function getRecentSyncedLeads(aid, limit = 50) {
  const sql = `
    SELECT id, name, email, phone, city, source, status, sync_date, created_at
    FROM kbcd_gst_all_leads
    WHERE aid = ?
    ORDER BY sync_date DESC
    LIMIT ?
  `;

  return await query(sql, [aid, limit]);
}

export async function checkLeadExists(aid, leadData) {
  const { sub_sheet_name, email, timestamp, sheetRowNumber } = leadData;

  let sql = `SELECT id FROM kbcd_gst_all_leads WHERE aid = ? AND sub_sheet_name = ? AND email = ?`;
  const params = [aid, sub_sheet_name, email.toLowerCase()];

  if (timestamp) {
    sql += ` AND timestamp = ?`;
    params.push(new Date(timestamp));
  }

  if (sheetRowNumber) {
    sql += ` AND sheet_row_number = ?`;
    params.push(sheetRowNumber);
  }

  const rows = await query(sql, params);
  return rows.length > 0;
}
