import express from 'express';
import { connectInstagram, disconnectInstagram, sessionExists } from '../services/instagramAuth.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ connected: sessionExists() });
});

router.post('/connect', async (req, res) => {
  try {
    await connectInstagram();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', (req, res) => {
  disconnectInstagram();
  res.json({ ok: true });
});

export default router;
