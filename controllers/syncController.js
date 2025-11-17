// controllers/syncController.js
import {
  getAllLeadsFromSheet,
  getSheetInfo,
  mapToCRMFields,
} from "../services/googleSheetsService.js";
import {
  createLead,
  findLeadByEmailAndTimestamp,
  findLeadByEmail,
  updateLead,
  getRecentSyncedLeads,
} from "../models/leads.js";
import {
  createSyncHistory,
  getRecentSyncHistory,
} from "../models/syncHistory.js";
import { getFieldMapping } from "../models/fieldMappings.js";
import { query } from "../config/database.js";
import axios from "axios";
import config from "../config/config.js";

async function processLead(aid, sheetLead, fieldMapping, spreadsheetId) {
  const leadData = mapToCRMFields(sheetLead, fieldMapping);

  if (!leadData.email) {
    return {
      rowNumber: sheetLead.rowNumber,
      status: "skipped",
      reason: "No email address provided",
    };
  }

  try {
    let result;
    let existingLead = null;

    // Check if this row has already been synced by checking email and row number
    const leadExists = await checkLeadRowExists(
      aid,
      leadData.email,
      sheetLead.rowNumber
    );
    if (leadExists) {
      return {
        rowNumber: sheetLead.rowNumber,
        leadId: leadExists.id,
        status: "skipped",
        reason: "Row already processed",
      };
    }

    // Create new lead
    const newLead = await createLead(aid, {
      ...leadData,
      sheetRowNumber: sheetLead.rowNumber,
      timestamp: new Date(), // Override with current timestamp
    });

    // console.log("line 43",newLead);

    // Call third-party API
    let processStatus = "failed";
    let errorMessage = null;
    try {
      const payload = {
        para: {
          cust_name: newLead.name,
          cust_email: newLead.email,
          phone_no: newLead.phone,
          source_id: newLead.source ? newLead.source : 'Google Sheet',
          google_sheet_id: spreadsheetId,
        },
      };

      console.log("payload line 57", payload);
      // console.log("aid", aid);

      // Make API call to third-party
      const response = await axios.post(config.getLeadCreate, payload, {
        headers: {
          "ENQ-BOOKS-KEY": aid,
          "Content-Type": "application/json",
        },
      });

      console.log("line 67", response.data);

      // Update record status based on response
      if (response.data?.status === "success") {
        processStatus = "success";
        console.log(`Successfully processed lead ${newLead.id}`);
      } else {
        console.log(`Third-party API returned failure for lead ${newLead.id}`);
      }
    } catch (apiError) {
      console.error(`Error processing lead ${newLead.id}:`, apiError.message);
      errorMessage = apiError?.response?.data?.message || apiError.message;
      // Keep process_status as 'failed'
    }

    // Update lead with process_status and error message
    await updateLead(aid, newLead.id, {
      process_status: processStatus,
      message: errorMessage,
    });

    result = {
      rowNumber: sheetLead.rowNumber,
      leadId: newLead.id,
      status: "created",
      reason: "New lead created",
      process_status: processStatus,
    };

    return result;
  } catch (error) {
    if (error.message === "DUPLICATE_LEAD") {
      return {
        rowNumber: sheetLead.rowNumber,
        status: "skipped",
        reason: "Duplicate lead (already exists in system)",
      };
    }
    throw error;
  }
}

async function checkLeadRowExists(aid, email, rowNumber) {
  const sql = `
    SELECT id FROM kbcd_gst_all_leads
    WHERE aid = ? AND email = ? AND sheet_row_number = ?
  `;
  const rows = await query(sql, [aid, email.toLowerCase(), rowNumber]);
  return rows.length > 0 ? rows[0] : null;
}

export async function syncLeads(req, res) {
  let syncHistoryId;

  try {
    const aid = req.headers["enq-books-key"];
    const { spreadsheetId, range } = req.body;

    // If range is the default "Sheet1!A:Z", don't pass it so the service can auto-detect the sheet name
    const shouldAutoDetectRange = !range || range === "Sheet1!A:Z";
    const finalRange = shouldAutoDetectRange ? null : range;

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: "Aid header is required",
      });
    }

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: "spreadsheetId is required",
      });
    }

    // Check if field mapping exists for this sheet
    const fieldMapping = await getFieldMapping(aid, spreadsheetId);
    if (!fieldMapping) {
      return res.status(400).json({
        success: false,
        error:
          "Field mapping not found. Please configure field mappings before syncing.",
      });
    }

    console.log(
      `Starting manual sync for sheet: ${spreadsheetId}, aid: ${aid}`
    );

    // Fetch leads from Google Sheets
    const leadsFromSheet = await getAllLeadsFromSheet(
      spreadsheetId,
      finalRange
    );

    if (leadsFromSheet.length === 0) {
      return res.json({
        success: true,
        message: "No leads found in sheet to sync",
        stats: {
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
        },
      });
    }

    console.log(`Processing ${leadsFromSheet.length} leads from sheet`);

    const syncResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    // Process each lead
    for (const [index, sheetLead] of leadsFromSheet.entries()) {
      try {
        const result = await processLead(
          aid,
          sheetLead,
          fieldMapping,
          spreadsheetId
        );
        syncResults.details.push(result);

        if (result.status === "created") syncResults.created++;
        else if (result.status === "updated") syncResults.updated++;
        else if (result.status === "skipped") syncResults.skipped++;
        else if (result.status === "error") syncResults.errors++;

        // Small delay to avoid overwhelming the database
        if (index % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.error(
          `Error processing lead at row ${sheetLead.rowNumber}:`,
          error
        );
        syncResults.errors++;
        syncResults.details.push({
          rowNumber: sheetLead.rowNumber,
          status: "error",
          error: error.message,
        });
      }
    }

    // Determine overall sync status
    const overallStatus =
      syncResults.errors === 0
        ? "success"
        : syncResults.created + syncResults.updated > 0
        ? "partial"
        : "error";

    // Record sync history
    syncHistoryId = await createSyncHistory(aid, {
      spreadsheetId,
      totalRecords: leadsFromSheet.length,
      createdCount: syncResults.created,
      updatedCount: syncResults.updated,
      skippedCount: syncResults.skipped,
      errorCount: syncResults.errors,
      syncType: "manual",
      status: overallStatus,
      errorMessage:
        overallStatus === "error" ? "Sync completed with errors" : null,
    });

    const response = {
      success: true,
      message: `Sync completed with status: ${overallStatus}`,
      syncId: syncHistoryId,
      stats: {
        total: leadsFromSheet.length,
        ...syncResults,
      },
      details: syncResults.details,
    };

    // console.log('Sync completed:', response.stats);
    res.json(response);
  } catch (error) {
    console.error("Sync error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function verifySheetConnection(req, res) {
  try {
    const { spreadsheetId } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: "spreadsheetId is required",
      });
    }

    const sheetInfo = await getSheetInfo(spreadsheetId);

    res.json({
      success: true,
      data: sheetInfo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to connect to sheet: ${error.message}`,
    });
  }
}

export async function getSyncHistory(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: "Aid header is required",
      });
    }

    const { limit = 50 } = req.query;

    const recentLeads = await getRecentSyncedLeads(aid, limit);
    const syncHistory = await getRecentSyncHistory(aid, 10);

    res.json({
      success: true,
      data: {
        recentLeads,
        syncHistory,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function getLeads(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: "Aid header is required",
      });
    }

    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT * FROM kbcd_gst_all_leads WHERE aid = ?`;
    let countSql = `SELECT COUNT(*) as total FROM kbcd_gst_all_leads WHERE aid = ?`;
    const params = [aid];

    if (status) {
      sql += ` AND status = ?`;
      countSql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [leads, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, status ? [aid, status] : [aid]),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function getAllLeads(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: "Aid header is required",
      });
    }

    const { process_status } = req.body;

    if (!process_status || !["success", "failed"].includes(process_status)) {
      return res.status(400).json({
        success: false,
        error:
          'process_status is required and must be either "success" or "failed"',
      });
    }

    const sql = `SELECT * FROM kbcd_gst_all_leads WHERE aid = ? AND process_status = ? ORDER BY created_at DESC`;
    const leads = await query(sql, [aid, process_status]);

    res.json({
      success: true,
      data: leads,
      count: leads.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function getLeadLogs(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: "Aid header is required",
      });
    }

    const sql = `SELECT * FROM kbcd_gst_lead_sync_history WHERE aid = ? AND created_count > 0 ORDER BY created_at DESC`;
    const logs = await query(sql, [aid]);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
