// routes/leads.js
import express from 'express';
import { syncLeads, verifySheetConnection, getSyncHistory, getLeads } from '../controllers/syncController.js';
import { createConnector, getSheets, createOrUpdateFieldMappings, getSheetColumns } from '../controllers/sheetController.js';

const router = express.Router();

// Sheet connector endpoints
router.post('/sheets/connector', createConnector);
router.post('/sheets/columns', getSheetColumns);
router.get('/sheets', getSheets);
router.post('/sheets/field-mapping', createOrUpdateFieldMappings);

// Manual sync endpoints
router.post('/sync/manual', syncLeads);
router.post('/sync/verify', verifySheetConnection);
router.get('/sync/history', getSyncHistory);
router.get('/', getLeads);

export default router;
