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

export function mapToCRMFields(sheetRow) {
  const fieldMappings = {
    'timestamp': 'timestamp',
    'email_address': 'email',
    'email': 'email',
    'name': 'name',
    'full_name': 'name',
    'phone_number': 'phone',
    'phone': 'phone',
    'company': 'company',
    'organization': 'company',
    'message': 'message',
    'comments': 'notes',
    'notes': 'notes',
  };

  const crmData = {
    source: 'Google Form',
    syncDate: new Date()
  };

  Object.keys(sheetRow).forEach(sheetField => {
    const crmField = fieldMappings[sheetField];
    if (crmField && sheetRow[sheetField]) {
      crmData[crmField] = sheetRow[sheetField];
    }
  });

  return crmData;
}

export async function getAllLeadsFromSheet(spreadsheetId, range = 'Sheet1!A:Z') {
  try {
    const sheets = getSheetsClient();
    console.log(`Fetching data from sheet: ${spreadsheetId}, range: ${range}`);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      console.log('No data found in sheet');
      return [];
    }

    console.log(`Found ${rows.length} rows in sheet`);

    const headers = rows[0].map(header => formatHeader(header));
    const dataRows = rows.slice(1);

    const leads = dataRows.map((row, index) => {
      const lead = { rowNumber: index + 2 };
      headers.forEach((header, colIndex) => {
        lead[header] = row[colIndex] || '';
      });
      return lead;
    });

    console.log(`Processed ${leads.length} leads`);
    return leads;

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