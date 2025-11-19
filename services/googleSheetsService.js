// services/googleSheetsService.js
import { getSheetsClient } from '../config/google-sheets.js';

function formatHeader(header) {
  if (!header) return 'unknown';

  return header
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function mapToCRMFields(sheetRow, fieldMapping = null) {
  // console.log("sheetRow",sheetRow);
  // console.log("fieldMapping",fieldMapping);
  
  const crmData = {
    syncDate: new Date()
  };

  if (!fieldMapping) {
    // No mapping provided, skip
    return crmData;
  }

  // Define fixed mapping from internal field names to database column names
  const internalFieldToDB = {
    cust_name: 'name',
    cust_email: 'email',
    cust_phone_no: 'phone',
    source_name: 'source',
    city_name: 'city'
  };

  // Dynamically build mapping from Google Sheet columns to database fields
  // using the saved field mappings from kbcd_gst_field_mappings
  const columnToDB = {};
  Object.keys(internalFieldToDB).forEach(internalField => {
    const rawSheetColumn = fieldMapping[internalField];
    if (rawSheetColumn) {
      const formattedColumn = formatHeader(rawSheetColumn);
      columnToDB[formattedColumn] = internalFieldToDB[internalField];
    }
  });

  // Process only the columns that are mapped
  Object.keys(columnToDB).forEach(columnName => {
    if (sheetRow[columnName]) {
      crmData[columnToDB[columnName]] = sheetRow[columnName];
    }
  });

  return crmData;
}

export async function getAllLeadsFromSheet(spreadsheetId, range = null) {
  try {
    const sheets = getSheetsClient();

    // If a specific range is provided, use it as before (for backward compatibility)
    if (range) {
      // console.log(`Fetching data from specific range: ${spreadsheetId}, range: ${range}`);

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = response.data.values;

      if (!rows || rows.length === 0) {
        console.log('No data found in specified range');
        return [];
      }

      // console.log(`Found ${rows.length} rows in specified range`);

      const headers = rows[0].map(header => formatHeader(header));
      const dataRows = rows.slice(1);

      const leads = dataRows.map((row, index) => {
        const lead = { rowNumber: index + 2 };
        headers.forEach((header, colIndex) => {
          lead[header] = row[colIndex] || '';
        });
        return lead;
      });

      // console.log(`Processed ${leads.length} leads from specified range`);
      return leads;
    }

    // No range provided: iterate through all sheets
    let sheetInfos = [];
    try {
      const sheetInfo = await getSheetInfo(spreadsheetId);
      if (sheetInfo.sheets && sheetInfo.sheets.length > 0) {
        sheetInfos = sheetInfo.sheets;
      } else {
        console.log('No sheets found in spreadsheet');
        return [];
      }
    } catch (infoError) {
      console.log('Could not get sheet info, cannot proceed');
      return [];
    }

    const allLeads = [];
    let totalRows = 0;

    // Iterate through all sheets
    for (const sheetInfo of sheetInfos) {
      const sheetName = sheetInfo.title;
      const currentRange = `${sheetName}!A:Z`;

      // console.log(`Fetching data from sheet: ${sheetName}, range: ${currentRange}`);

      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: currentRange,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
          console.log(`No data found in sheet ${sheetName}`);
          continue;
        }

        // console.log(`Found ${rows.length} rows in sheet ${sheetName}`);
        totalRows += rows.length;

        const headers = rows[0].map(header => formatHeader(header));
        const dataRows = rows.slice(1);

        const sheetLeads = dataRows.map((row, index) => {
          const lead = {
            rowNumber: index + 2,
            sheetName: sheetName
          };
          headers.forEach((header, colIndex) => {
            lead[header] = row[colIndex] || '';
          });
          return lead;
        });

        allLeads.push(...sheetLeads);
        // console.log(`Processed ${sheetLeads.length} leads from sheet ${sheetName}`);
      } catch (rangeError) {
        console.log(`Failed to fetch data from sheet ${sheetName}:`, rangeError.message);
        continue;
      }
    }

    // console.log(`Total processed ${allLeads.length} leads from ${sheetInfos.length} sheets, ${totalRows} total rows`);
    return allLeads;

  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    throw new Error(`Failed to fetch from Google Sheets: ${error.message}`);
  }
}

export async function getSheetInfo(spreadsheetId) {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties'
    });

    return {
      title: response.data.properties.title,
      sheets: response.data.sheets.map(sheet => ({
        title: sheet.properties.title,
        sheetId: sheet.properties.sheetId
      }))
    };
  } catch (error) {
    console.error('Error fetching sheet info:', error);
    throw error;
  }
}

export async function getSheetHeaders(spreadsheetId) {
  try {
    const sheets = getSheetsClient();
    // console.log(`Fetching headers from spreadsheet: ${spreadsheetId}`);

    // Get all sheet names
    let sheetInfos = [];
    try {
      const sheetInfo = await getSheetInfo(spreadsheetId);
      if (sheetInfo.sheets && sheetInfo.sheets.length > 0) {
        sheetInfos = sheetInfo.sheets;
      }
    } catch (infoError) {
      console.log('Could not get sheet info:', infoError.message);
      return {}; // Return empty object if cannot get sheet info
    }

    const allHeaders = {};

    // Iterate through all sheets
    for (const sheetInfo of sheetInfos) {
      const sheetName = sheetInfo.title;
      // console.log(`Fetching headers for sheet: ${sheetName}`);

      const rangeTry = `${sheetName}!A1:Z1`;

      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: rangeTry,
        });

        const rows = response.data.values;

        if (rows && rows.length > 0) {
          const headers = rows[0].map(header => header || null).filter(header => header);
          // console.log(`Found ${headers.length} headers for sheet ${sheetName}:`, headers);
          allHeaders[sheetName] = headers;
        } else {
          console.log(`No data found in sheet ${sheetName}`);
          allHeaders[sheetName] = [];
        }
      } catch (rangeError) {
        console.log(`Failed to fetch headers for sheet ${sheetName}:`, rangeError.message);
        allHeaders[sheetName] = [];
      }
    }

    return allHeaders;

  } catch (error) {
    console.error('Error fetching sheet headers:', error);
    throw new Error(`Failed to fetch sheet headers: ${error.message}`);
  }
}
