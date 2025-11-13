// config/google-sheets.js
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sheetsClient;

export function getSheetsClient() {
  if (!sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, '../service-account-key.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}