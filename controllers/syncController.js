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
import { getFieldMappings, getFieldMapping } from "../models/fieldMappings.js";
import { createFailedLead } from "../models/failedLeads.js";
import { query } from "../config/database.js";
import axios from "axios";
import config from "../config/config.js";

async function processLead(aid, sub_sheet_name, sheetLead, fieldMapping, spreadsheetId) {
  // Use the dynamic mapping approach: mapToCRMFields already handles this
  const leadData = mapToCRMFields(sheetLead, fieldMapping);

  if (!leadData.email) {
    await createFailedLead({
      aid,
      spreadsheet_id: spreadsheetId,
      sub_sheet_name,
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      city: leadData.city,
      source: leadData.source,
      sheetRowNumber: sheetLead.rowNumber,
      reason: 'missing_email',
      data: sheetLead
    });
    return {
      rowNumber: sheetLead.rowNumber,
      status: "failed",
      reason: "Missing email address",
    };
  }

  if (!leadData.name) {
    await createFailedLead({
      aid,
      spreadsheet_id: spreadsheetId,
      sub_sheet_name,
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      city: leadData.city,
      source: leadData.source,
      sheetRowNumber: sheetLead.rowNumber,
      reason: 'missing_name',
      data: sheetLead
    });
    return {
      rowNumber: sheetLead.rowNumber,
      status: "failed",
      reason: "Missing name",
    };
  }

  try {
    let result;

    // Check if this row has already been synced by checking email and row number
    const leadExists = await checkLeadRowExists(
      aid,
      sub_sheet_name,
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

    // Create new lead using dynamic mapping data
    const newLead = await createLead(aid, {
      spreadsheet_id: spreadsheetId,
      sub_sheet_name,
      name: leadData.name || null,
      email: leadData.email || null,
      phone: leadData.phone || null,
      city: leadData.city || null,
      source: leadData.source || null,
      sheetRowNumber: sheetLead.rowNumber,
      timestamp: new Date(), // Override with current timestamp
    });

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

      // Make API call to third-party
      const response = await axios.post(config.getLeadCreate, payload, {
        headers: {
          "ENQ-BOOKS-KEY": aid,
          "Content-Type": "application/json",
        },
      });

      console.log("Third-party API response:", response.data);

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
      await createFailedLead({
        aid,
        spreadsheet_id: spreadsheetId,
        sub_sheet_name,
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        city: leadData.city,
        source: leadData.source,
        sheetRowNumber: sheetLead.rowNumber,
        reason: 'duplicate',
        data: sheetLead
      });
      return {
        rowNumber: sheetLead.rowNumber,
        status: "failed",
        reason: "Duplicate lead",
      };
    }
    throw error;
  }
}

async function checkLeadRowExists(aid, sub_sheet_name, email, rowNumber) {
  const sql = `
    SELECT id FROM kbcd_gst_all_leads
    WHERE aid = ? AND sub_sheet_name = ? AND email = ? AND sheet_row_number = ?
  `;
  const rows = await query(sql, [aid, sub_sheet_name, email.toLowerCase(), rowNumber]);
  return rows.length > 0 ? rows[0] : null;
}

export async function syncLeads(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { spreadsheetId, range } = req.body;

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

    // Get field mappings for this spreadsheet
    const fieldMappings = await getFieldMappings(aid, spreadsheetId);
    if (fieldMappings.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No field mappings found for this spreadsheetId. Please configure field mappings before syncing.",
      });
    }

    console.log(
      `Starting manual sync for spreadsheet: ${spreadsheetId}, aid: ${aid}, found ${fieldMappings.length} sub-sheets with mappings`
    );

    const overallSyncResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: 0,
      details: [],
      subSheetsProcessed: [],
    };

    // Process each sub-sheet that has field mapping
    for (const fieldMapping of fieldMappings) {
      const sub_sheet_name = fieldMapping.sub_sheet_name;

      try {
        // Construct range for the sub-sheet
        const sheetRange = range
          ? `${sub_sheet_name}!${range.split('!')[1] || 'A:Z'}`
          : `${sub_sheet_name}!A:Z`;

        console.log(`Processing sub-sheet: ${sub_sheet_name} with range: ${sheetRange}`);

        // Fetch leads from this specific sub-sheet
        const leadsFromSheet = await getAllLeadsFromSheet(spreadsheetId, sheetRange);

        const subSheetStats = {
          sub_sheet_name,
          total: leadsFromSheet.length,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          errors: 0,
          status: "pending",
          details: [],
        };

        if (leadsFromSheet.length === 0) {
          subSheetStats.status = "success";
          overallSyncResults.subSheetsProcessed.push(subSheetStats);
          await createSyncHistory(aid, {
            spreadsheetId,
            sub_sheet_name,
            totalRecords: 0,
            failedCount: 0,
            syncType: "manual",
            status: "success",
          });
          continue;
        }

        // Process each lead in this sub-sheet
        for (const [index, sheetLead] of leadsFromSheet.entries()) {
          try {
            const result = await processLead(
              aid,
              sub_sheet_name,
              sheetLead,
              fieldMapping,
              spreadsheetId
            );
            subSheetStats.details.push(result);

            if (result.status === "created") subSheetStats.created++;
            else if (result.status === "updated") subSheetStats.updated++;
            else if (result.status === "skipped") subSheetStats.skipped++;
            else if (result.status === "failed") subSheetStats.failed++;
            else if (result.status === "error") subSheetStats.errors++;

            // Accumulate overall
            if (result.status === "created") overallSyncResults.created++;
            else if (result.status === "updated") overallSyncResults.updated++;
            else if (result.status === "skipped") overallSyncResults.skipped++;
            else if (result.status === "failed") overallSyncResults.failed++;
            else if (result.status === "error") overallSyncResults.errors++;

            overallSyncResults.details.push({
              sub_sheet_name,
              ...result,
            });

            // Small delay to avoid overwhelming the database
            if (index % 10 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
          } catch (error) {
            console.error(
              `Error processing lead at row ${sheetLead.rowNumber} in ${sub_sheet_name}:`,
              error
            );
            subSheetStats.errors++;
            overallSyncResults.errors++;
            subSheetStats.details.push({
              rowNumber: sheetLead.rowNumber,
              status: "error",
              error: error.message,
            });
            overallSyncResults.details.push({
              sub_sheet_name,
              rowNumber: sheetLead.rowNumber,
              status: "error",
              error: error.message,
            });
          }
        }

        // Determine sub-sheet sync status
        subSheetStats.status =
          subSheetStats.errors === 0
            ? "success"
            : subSheetStats.created + subSheetStats.updated > 0
            ? "partial"
            : "error";

        overallSyncResults.subSheetsProcessed.push(subSheetStats);

        // Record sub-sheet sync history
        await createSyncHistory(aid, {
          spreadsheetId,
          sub_sheet_name,
          totalRecords: subSheetStats.total,
          createdCount: subSheetStats.created,
          updatedCount: subSheetStats.updated,
          skippedCount: subSheetStats.skipped,
          errorCount: subSheetStats.errors,
          failedCount: subSheetStats.failed,
          syncType: "manual",
          status: subSheetStats.status,
          errorMessage: subSheetStats.status === "error" ? "Sync completed with errors" : null,
        });

      } catch (subSheetError) {
        console.error(`Error processing sub-sheet ${sub_sheet_name}:`, subSheetError);
        overallSyncResults.errors++;
        overallSyncResults.details.push({
          sub_sheet_name,
          status: "error",
          error: subSheetError.message,
        });
        overallSyncResults.subSheetsProcessed.push({
          sub_sheet_name,
          status: "error",
          error: subSheetError.message,
        });
      }
    }

    // Determine overall sync status
    const overallStatus =
      overallSyncResults.errors === 0
        ? "success"
        : overallSyncResults.created + overallSyncResults.updated > 0
        ? "partial"
        : "error";

    const response = {
      success: true,
      message: `Sync completed for ${fieldMappings.length} sub-sheets with overall status: ${overallStatus}`,
      stats: {
        totalSubSheets: fieldMappings.length,
        totalRecords: overallSyncResults.details.length,
        ...overallSyncResults,
      },
      subSheetsProcessed: overallSyncResults.subSheetsProcessed,
      details: overallSyncResults.details,
    };

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
