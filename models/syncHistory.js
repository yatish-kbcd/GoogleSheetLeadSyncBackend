// models/syncHistory.js
import { query } from '../config/database.js';

export async function createSyncHistory(aid, syncData) {
  const {
    spreadsheetId,
    totalRecords,
    createdCount = 0,
    updatedCount = 0,
    skippedCount = 0,
    errorCount = 0,
    syncType = 'manual',
    status = 'success',
    errorMessage = null
  } = syncData;

  const sql = `
    INSERT INTO kbcd_gst_lead_sync_history
    (aid, spreadsheet_id, total_records, created_count, updated_count, skipped_count,
     error_count, sync_type, status, error_message, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;

  const result = await query(sql, [
    aid,
    spreadsheetId,
    totalRecords,
    createdCount,
    updatedCount,
    skippedCount,
    errorCount,
    syncType,
    status,
    errorMessage
  ]);

  return result.insertId;
}

export async function getRecentSyncHistory(aid, limit = 10) {
  const sql = `
    SELECT * FROM kbcd_gst_lead_sync_history
    WHERE aid = ?
    ORDER BY created_at DESC
    LIMIT ?
  `;

  return await query(sql, [aid, limit]);
}
