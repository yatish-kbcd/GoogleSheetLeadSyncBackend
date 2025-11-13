// models/leads.js
import { query } from '../config/database.js';

export async function createLead(leadData) {
  const {
    name,
    email,
    phone,
    company,
    source = 'Google Form',
    message,
    notes,
    status = 'new',
    timestamp,
    sheetRowNumber
  } = leadData;

  const sql = `
    INSERT INTO leads 
    (name, email, phone, company, source, message, notes, status, timestamp, sheet_row_number) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    name || null,
    email.toLowerCase(),
    phone || null,
    company || null,
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

export async function findLeadByEmailAndTimestamp(email, timestamp) {
  const sql = `
    SELECT * FROM leads 
    WHERE email = ? AND timestamp = ?
  `;
  
  const rows = await query(sql, [email.toLowerCase(), new Date(timestamp)]);
  return rows.length > 0 ? rows[0] : null;
}

export async function findLeadByEmail(email) {
  const sql = `SELECT * FROM leads WHERE email = ?`;
  const rows = await query(sql, [email.toLowerCase()]);
  return rows.length > 0 ? rows[0] : null;
}

export async function updateLead(id, leadData) {
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

  values.push(id);

  const sql = `
    UPDATE leads 
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `;

  const result = await query(sql, values);
  return result.affectedRows > 0;
}

export async function getRecentSyncedLeads(limit = 50) {
  const sql = `
    SELECT id, name, email, phone, company, source, status, sync_date, created_at
    FROM leads 
    ORDER BY sync_date DESC 
    LIMIT ?
  `;
  
  return await query(sql, [limit]);
}

export async function checkLeadExists(leadData) {
  const { email, timestamp, sheetRowNumber } = leadData;
  
  let sql = `SELECT id FROM leads WHERE email = ?`;
  const params = [email.toLowerCase()];

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