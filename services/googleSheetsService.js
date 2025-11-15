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
  // Default field mappings if no custom mapping provided
  const defaultMappings = {
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
    // 'source': 'source',
    'campaignname': 'source',
  };

  const crmData = {
    syncDate: new Date()
  };

  // If field mapping is provided, use it for custom fields
  if (fieldMapping) {
    const customMappings = {
      [fieldMapping.cust_name]: 'name',
      [fieldMapping.cust_phone_no]: 'phone',
      [fieldMapping.cust_email]: 'email',
      [fieldMapping.source_name]: 'source',
      [fieldMapping.city_name]: 'company' // Using company field for city
    };

    Object.keys(sheetRow).forEach(sheetField => {
      const crmField = customMappings[sheetField] || defaultMappings[sheetField];
      if (crmField && sheetRow[sheetField]) {
        crmData[crmField] = sheetRow[sheetField];
      }
    });
  } else {
    // Fall back to default mappings
    Object.keys(sheetRow).forEach(sheetField => {
      const crmField = defaultMappings[sheetField];
      if (crmField && sheetRow[sheetField]) {
        crmData[crmField] = sheetRow[sheetField];
      }
    });
  }

  return crmData;
}

export async function getAllLeadsFromSheet(spreadsheetId, range = null) {
  try {
    const sheets = getSheetsClient();

    // If no range provided, get the actual sheet name and construct range
    if (!range) {
      try {
        const sheetInfo = await getSheetInfo(spreadsheetId);
        if (sheetInfo.sheets && sheetInfo.sheets.length > 0) {
          const sheetName = sheetInfo.sheets[0].title;
          range = `${sheetName}!A:Z`;
        } else {
          range = 'A:Z'; // Fallback to first sheet
        }
      } catch (infoError) {
        console.log('Could not get sheet info, using default range');
        range = 'A:Z';
      }
    }

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

export async function getSheetHeaders(spreadsheetId) {
  try {
    const sheets = getSheetsClient();
    // console.log(`Fetching headers from sheet: ${spreadsheetId}`);

    // First try to get the actual sheet names
    let sheetName = null;
    try {
      const sheetInfo = await getSheetInfo(spreadsheetId);
      if (sheetInfo.sheets && sheetInfo.sheets.length > 0) {
        sheetName = sheetInfo.sheets[0].title; // Use the first sheet name
      }
    } catch (infoError) {
      console.log('Could not get sheet info:', infoError.message);
    }

    let tries = [];
    if (sheetName) {
      tries.push(`${sheetName}!A1:Z1`);
    }
    tries.push('A1:Z1'); // Default sheet try

    for (const rangeTry of tries) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: rangeTry,
        });

        const rows = response.data.values;

        if (rows && rows.length > 0) {
          const headers = rows[0].map(header => header || null).filter(header => header);
          // console.log(`Found ${headers.length} headers using range ${rangeTry}:`, headers);
          return headers;
        }
      } catch (rangeError) {
        console.log(`Range ${rangeTry} failed:`, rangeError.message);
      }
    }

    console.log('No data found in sheet');
    return [];

  } catch (error) {
    console.error('Error fetching sheet headers:', error);
    throw new Error(`Failed to fetch sheet headers: ${error.message}`);
  }
}
