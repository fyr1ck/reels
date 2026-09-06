import express from 'express';
import { getFullStorageUsage, clearFolder, clearAllFolders } from '../services/storageCleaner.js';

const router = express.Router();

router.get('/usage', async (req, res) => {
  try {
    res.json(getFullStorageUsage());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clear/:folder', async (req, res) => {
  try {
    const result = await clearFolder(req.params.folder);
    res.json({ ok: true, ...result, storage: getFullStorageUsage() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clear-all', async (req, res) => {
  try {
    const results = await clearAllFolders();
    res.json({ ok: true, results, storage: getFullStorageUsage() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
