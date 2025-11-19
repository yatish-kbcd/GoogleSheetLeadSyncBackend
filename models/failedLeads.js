// models/failedLeads.js
import { query } from '../config/database.js';

export async function createFailedLead(failedLeadData) {
  const {
    aid,
    spreadsheet_id,
    sub_sheet_name,
    name,
    email,
    phone,
    city,
    source = 'Google Sheet',
    timestamp,
    sheetRowNumber,
    reason,
    data
  } = failedLeadData;

  const sql = `
    INSERT INTO kbcd_gst_failed_leads
    (aid, spreadsheet_id, sub_sheet_name, name, email, phone, city, source, timestamp, sheet_row_number, reason, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    aid,
    spreadsheet_id,
    sub_sheet_name,
    name || null,
    email || null,
    phone || null,
    city || null,
    source,
    timestamp ? new Date(timestamp) : new Date(),
    sheetRowNumber || null,
    reason,
    data ? JSON.stringify(data) : null
  ];

  try {
    const result = await query(sql, params);
    return { id: result.insertId, ...failedLeadData };
  } catch (error) {
    throw error;
  }
}

export async function getFailedLeads(aid) {
  const sql = 'SELECT * FROM kbcd_gst_failed_leads WHERE aid = ? ORDER BY created_at DESC';
  return await query(sql, [aid]);
}
