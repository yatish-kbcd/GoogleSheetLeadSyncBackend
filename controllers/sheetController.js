// controllers/sheetController.js
import { getSheetConnectorsByAid, createSheetConnector, getSheetConnector, deleteSheetConnectorWithMappings } from '../models/sheetConnector.js';
import { getFieldMapping, createOrUpdateFieldMapping } from '../models/fieldMappings.js';
import { getSheetHeaders } from '../services/googleSheetsService.js';

export async function createConnector(req, res) {
  try {
    const aid = req.headers["enq-books-key"];
    const { sheet_id, sheet_name } = req.body;

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

    const connectorId = await createSheetConnector(aid, sheet_id, sheet_name);

    res.json({
      success: true,
      data: {
        id: connectorId,
        aid,
        sheet_id,
        sheet_name,
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
        columns: headers
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

    // For each connector, check if field mapping exists
    const sheetsWithMapping = await Promise.all(
      connectors.map(async (connector) => {
        const fieldMapping = await getFieldMapping(aid, connector.sheet_id);
        return {
          id: connector.id,
          sheet_id: connector.sheet_id,
          sheet_name: connector.sheet_name ? connector.sheet_name : "NA",
          created_at: connector.created_at,
          field_mapping_status: fieldMapping ? true : false
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
    const { sheet_id, ...mapping } = req.body;

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

    // Validate required fields
    const requiredFields = ['cust_name', 'cust_phone_no', 'cust_email'];
    const missingFields = requiredFields.filter(field => !mapping[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    await createOrUpdateFieldMapping(aid, sheet_id, mapping);

    res.json({
      success: true,
      message: 'Field mapping saved successfully',
      data: {
        aid,
        sheet_id,
        ...mapping
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
