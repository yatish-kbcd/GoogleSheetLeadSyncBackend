// controllers/syncController.js
import { getAllLeadsFromSheet, getSheetInfo, mapToCRMFields } from '../services/googleSheetsService.js';
import { createLead, findLeadByEmailAndTimestamp, findLeadByEmail, updateLead, getRecentSyncedLeads } from '../models/leads.js';
import { createSyncHistory, getRecentSyncHistory } from '../models/syncHistory.js';
import { query } from '../config/database.js';

async function processLead(sheetLead, forceUpdate = false) {
  const leadData = mapToCRMFields(sheetLead);
  
  if (!leadData.email) {
    return {
      rowNumber: sheetLead.rowNumber,
      status: 'skipped',
      reason: 'No email address provided'
    };
  }

  try {
    let result;
    let existingLead = null;

    // Try to find existing lead by email and timestamp first
    if (leadData.timestamp) {
      existingLead = await findLeadByEmailAndTimestamp(leadData.email, leadData.timestamp);
    }

    // If not found by timestamp, try by email only
    if (!existingLead) {
      existingLead = await findLeadByEmail(leadData.email);
    }

    if (existingLead && !forceUpdate) {
      return {
        rowNumber: sheetLead.rowNumber,
        leadId: existingLead.id,
        status: 'skipped',
        reason: 'Lead already exists'
      };
    }

    if (existingLead && forceUpdate) {
      // Update existing lead
      await updateLead(existingLead.id, {
        ...leadData,
        sheetRowNumber: sheetLead.rowNumber
      });
      
      result = {
        rowNumber: sheetLead.rowNumber,
        leadId: existingLead.id,
        status: 'updated',
        reason: 'Lead updated successfully'
      };
    } else {
      // Create new lead
      const newLead = await createLead({
        ...leadData,
        sheetRowNumber: sheetLead.rowNumber
      });
      
      result = {
        rowNumber: sheetLead.rowNumber,
        leadId: newLead.id,
        status: 'created',
        reason: 'New lead created'
      };
    }

    return result;

  } catch (error) {
    if (error.message === 'DUPLICATE_LEAD') {
      return {
        rowNumber: sheetLead.rowNumber,
        status: 'skipped',
        reason: 'Duplicate lead (already exists in system)'
      };
    }
    throw error;
  }
}

export async function syncLeads(req, res) {
  let syncHistoryId;
  
  try {
    const { spreadsheetId, range, forceUpdate = false } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'spreadsheetId is required'
      });
    }

    console.log(`Starting manual sync for sheet: ${spreadsheetId}`);

    // Fetch leads from Google Sheets
    const leadsFromSheet = await getAllLeadsFromSheet(spreadsheetId, range);
    
    if (leadsFromSheet.length === 0) {
      return res.json({
        success: true,
        message: 'No leads found in sheet to sync',
        stats: {
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: 0
        }
      });
    }

    console.log(`Processing ${leadsFromSheet.length} leads from sheet`);

    const syncResults = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process each lead
    for (const [index, sheetLead] of leadsFromSheet.entries()) {
      try {
        const result = await processLead(sheetLead, forceUpdate);
        syncResults.details.push(result);
        
        if (result.status === 'created') syncResults.created++;
        else if (result.status === 'updated') syncResults.updated++;
        else if (result.status === 'skipped') syncResults.skipped++;
        else if (result.status === 'error') syncResults.errors++;

        // Small delay to avoid overwhelming the database
        if (index % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

      } catch (error) {
        console.error(`Error processing lead at row ${sheetLead.rowNumber}:`, error);
        syncResults.errors++;
        syncResults.details.push({
          rowNumber: sheetLead.rowNumber,
          status: 'error',
          error: error.message
        });
      }
    }

    // Determine overall sync status
    const overallStatus = syncResults.errors === 0 ? 'success' : 
                         syncResults.created + syncResults.updated > 0 ? 'partial' : 'error';

    // Record sync history
    syncHistoryId = await createSyncHistory({
      spreadsheetId,
      totalRecords: leadsFromSheet.length,
      createdCount: syncResults.created,
      updatedCount: syncResults.updated,
      skippedCount: syncResults.skipped,
      errorCount: syncResults.errors,
      syncType: 'manual',
      status: overallStatus,
      errorMessage: overallStatus === 'error' ? 'Sync completed with errors' : null
    });

    const response = {
      success: true,
      message: `Sync completed with status: ${overallStatus}`,
      syncId: syncHistoryId,
      stats: {
        total: leadsFromSheet.length,
        ...syncResults
      },
      details: syncResults.details
    };

    console.log('Sync completed:', response.stats);
    res.json(response);

  } catch (error) {
    console.error('Sync error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function verifySheetConnection(req, res) {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'spreadsheetId is required'
      });
    }

    const sheetInfo = await getSheetInfo(spreadsheetId);
    
    res.json({
      success: true,
      data: sheetInfo
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Failed to connect to sheet: ${error.message}`
    });
  }
}

export async function getSyncHistory(req, res) {
  try {
    const { limit = 50 } = req.query;
    
    const recentLeads = await getRecentSyncedLeads(limit);
    const syncHistory = await getRecentSyncHistory(10);
    
    res.json({
      success: true,
      data: {
        recentLeads,
        syncHistory
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getLeads(req, res) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT * FROM leads`;
    let countSql = `SELECT COUNT(*) as total FROM leads`;
    const params = [];

    if (status) {
      sql += ` WHERE status = ?`;
      countSql += ` WHERE status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [leads, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, status ? [status] : [])
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}