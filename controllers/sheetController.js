// controllers/sheetController.js
import { getSheetConnectorsByAid, createSheetConnector, getSheetConnector, deleteSheetConnectorWithMappings } from '../models/sheetConnector.js';
import { getFieldMappings, createOrUpdateFieldMapping } from '../models/fieldMappings.js';
import { getFailedLeads } from '../models/failedLeads.js';
import { getSheetHeaders } from '../services/googleSheetsService.js';

export async function createConnector(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { sheet_id, sheet_name, emp_id } = req.body;

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    if (!sheet_id) {
      return res.status(400).json({
        success: false,
        error: 'sheet_id is required in request body'
      });
    }

    // Check if connector already exists
    const existingConnector = await getSheetConnector(aid, sheet_id);
    if (existingConnector) {
      return res.status(409).json({
        success: false,
        error: 'Sheet connector already exists for this aid and sheet_id'
      });
    }

    const connectorId = await createSheetConnector(aid, sheet_id, sheet_name, emp_id);

    res.json({
      success: true,
      data: {
        id: connectorId,
        aid,
        sheet_id,
        sheet_name,
        emp_id,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Create connector error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function deleteConnector(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { sheet_id } = req.body;

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    if (!sheet_id) {
      return res.status(400).json({
        success: false,
        error: 'sheet_id is required in request body'
      });
    }

    // Check if connector exists for this sheet
    const connector = await getSheetConnector(aid, sheet_id);
    if (!connector) {
      return res.status(404).json({
        success: false,
        error: 'Sheet connector not found'
      });
    }

    const deleted = await deleteSheetConnectorWithMappings(aid, sheet_id);

    if (deleted) {
      res.json({
        success: true,
        message: 'Sheet connector and related field mappings deleted successfully',
        data: {
          aid,
          sheet_id
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete connector'
      });
    }

  } catch (error) {
    console.error('Delete connector error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getSheetColumns(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { sheet_id } = req.body;

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    if (!sheet_id) {
      return res.status(400).json({
        success: false,
        error: 'sheet_id is required in request body'
      });
    }

    // Check if connector exists for this sheet
    const connector = await getSheetConnector(aid, sheet_id);
    if (!connector) {
      return res.status(404).json({
        success: false,
        error: 'Sheet connector not found. Please create a connector first.'
      });
    }

    const headers = await getSheetHeaders(sheet_id);

    res.json({
      success: true,
      data: {
        sheet_id,
        sheets: headers
      }
    });

  } catch (error) {
    console.error('Get sheet columns error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getSheets(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    const connectors = await getSheetConnectorsByAid(aid);

    // For each connector, check field mapping status per sub_sheet_name
    const sheetsWithMapping = await Promise.all(
      connectors.map(async (connector) => {
        const sheets = await getSheetHeaders(connector.sheet_id);
        // console.log("line 176",sheets);
        
        const fieldMappings = await getFieldMappings(aid, connector.sheet_id);

        const field_mapping_status = {};
        Object.keys(sheets).forEach(sheetName => {
          field_mapping_status[sheetName] = fieldMappings.some(mapping => mapping.sub_sheet_name === sheetName);
        });

        return {
          id: connector.id,
          sheet_id: connector.sheet_id,
          sheet_name: connector.sheet_name ? connector.sheet_name : "NA",
          emp_id: connector.emp_id ? connector.emp_id : "NA",
          created_at: connector.created_at,
          field_mapping_status
        };
      })
    );

    res.json({
      success: true,
      data: sheetsWithMapping
    });

  } catch (error) {
    console.error('Get sheets error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function createOrUpdateFieldMappings(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { sheet_id, sheets } = req.body;

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    if (!sheet_id) {
      return res.status(400).json({
        success: false,
        error: 'sheet_id is required in request body'
      });
    }

    if (!sheets || typeof sheets !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'sheets object is required in request body'
      });
    }

    // Check if connector exists for this sheet
    const connector = await getSheetConnector(aid, sheet_id);
    if (!connector) {
      return res.status(404).json({
        success: false,
        error: 'Sheet connector not found. Please create a connector first.'
      });
    }

    // Process each sub-sheet mapping
    for (const [sub_sheet_name, mapping] of Object.entries(sheets)) {
      // Validate required fields for each mapping
      const requiredFields = ['cust_name', 'cust_phone_no', 'cust_email'];
      const missingFields = requiredFields.filter(field => !mapping[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required fields for sub-sheet ${sub_sheet_name}: ${missingFields.join(', ')}`
        });
      }

      await createOrUpdateFieldMapping(aid, sheet_id, sub_sheet_name, mapping);
    }

    res.json({
      success: true,
      message: 'Field mappings saved successfully',
      data: {
        aid,
        sheet_id,
        sheets
      }
    });

  } catch (error) {
    console.error('Create/update field mapping error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getFieldMappingsController(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    const { sheet_id } = req.body;

    if (!sheet_id) {
      return res.status(400).json({
        success: false,
        error: 'sheet_id is required in request body'
      });
    }

    const mappings = await getFieldMappings(aid, sheet_id);

    // Group by sub_sheet_name
    const grouped = {};
    mappings.forEach(mapping => {
      grouped[mapping.sub_sheet_name] = mapping;
    });

    res.json({
      success: true,
      data: grouped
    });

  } catch (error) {
    console.error('Get field mappings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getFailedLeadsController(req, res) {
  try {
    const aid = req.headers["enq-books-key"];

    if (!aid) {
      return res.status(400).json({
        success: false,
        error: 'Aid header is required'
      });
    }

    const failedLeads = await getFailedLeads(aid);

    res.json({
      success: true,
      data: failedLeads,
      count: failedLeads.length
    });

  } catch (error) {
    console.error('Get failed leads error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
