// routes/leads.js
import express from 'express';
import { syncLeads, verifySheetConnection, getSyncHistory, getLeads, getAllLeads, getLeadLogs } from '../controllers/syncController.js';
import { createConnector, getSheets, createOrUpdateFieldMappings, getSheetColumns, deleteConnector } from '../controllers/sheetController.js';

const router = express.Router();

// Sheet connector endpoints
router.post('/sheets/connector', createConnector);
router.delete('/sheets/connector', deleteConnector);
router.post('/sheets/columns', getSheetColumns);
router.get('/sheets', getSheets);
router.post('/sheets/field-mapping', createOrUpdateFieldMappings);

// Manual sync endpoints
router.post('/sync/manual', syncLeads);
router.post('/sync/verify', verifySheetConnection);
router.get('/sync/history', getSyncHistory);
router.get('/lead-logs', getLeadLogs);
router.post('/allLeads', getAllLeads);
router.get('/', getLeads);

export default router;
