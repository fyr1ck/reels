import express from 'express';
import { prisma } from '../db/prisma.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  const logs = await prisma.log.findMany({ orderBy: { timestamp: 'desc' }, take: limit });
  res.json(logs);
});

// DELETE /api/logs — limpa todo o histórico de logs (usado pelo botão
// "Resetar dashboard"). Não afeta vídeos, agendamentos nem configurações.
router.delete('/', async (req, res) => {
  try {
    const { count } = await prisma.log.deleteMany();
    res.json({ ok: true, deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
