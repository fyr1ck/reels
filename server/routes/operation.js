import express from 'express';
import { getCoverage, getUpcoming } from '../services/coverageService.js';

const router = express.Router();

// GET /api/operation — panorama somente leitura da operacao:
// fila disponivel, ritmo diario, dias de cobertura, proxima publicacao.
router.get('/', async (req, res) => {
  try {
    const coverage = await getCoverage();
    res.json(coverage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/operation/upcoming — proximas publicacoes agendadas.
router.get('/upcoming', async (req, res) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 12);
    res.json(await getUpcoming(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
