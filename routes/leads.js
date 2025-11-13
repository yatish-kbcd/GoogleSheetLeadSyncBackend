// routes/leads.js
import express from 'express';
import { syncLeads, verifySheetConnection, getSyncHistory, getLeads } from '../controllers/syncController.js';

const router = express.Router();

// Manual sync endpoints
router.post('/sync/manual', syncLeads);
router.post('/sync/verify', verifySheetConnection);
router.get('/sync/history', getSyncHistory);
router.get('/', getLeads);

export default router;