import express from 'express';
import fs from 'fs';
import { prisma } from '../db/prisma.js';
import { logEvent } from '../services/logger.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  const [pending, published, failed, totalQueue] = await Promise.all([
    prisma.video.count({ where: { status: 'PENDING' } }),
    prisma.video.count({ where: { status: 'PUBLISHED' } }),
    prisma.video.count({ where: { status: 'FAILED' } }),
    prisma.video.count(),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [todayPublications, todayPublished, nextPublication, recentErrors] = await Promise.all([
    prisma.publication.count({ where: { scheduledAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.publication.count({ where: { status: 'PUBLISHED', publishedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.publication.findFirst({ where: { status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, include: { video: true } }),
    prisma.log.findMany({ where: { status: 'ERROR' }, orderBy: { timestamp: 'desc' }, take: 5 }),
  ]);

  res.json({ pending, published, failed, totalQueue, todayPublications, todayPublished, nextPublication, recentErrors });
});

// POST /api/dashboard/reset — "Resetar dashboard": apaga definitivamente os
// registros de vídeos PUBLICADOS e FALHADOS (banco + arquivo, se existir) e
// limpa todo o histórico de logs. Zera os números mostrados no dashboard.
// NUNCA mexe em vídeos PENDENTES/SCHEDULED nem em configurações.
router.post('/reset', async (req, res) => {
  try {
    const toRemove = await prisma.video.findMany({ where: { status: { in: ['PUBLISHED', 'FAILED'] } } });

    for (const video of toRemove) {
      await prisma.publication.deleteMany({ where: { videoId: video.id } });
      await prisma.video.delete({ where: { id: video.id } });
      if (video.filepath && fs.existsSync(video.filepath)) {
        try { fs.unlinkSync(video.filepath); } catch { /* best-effort */ }
      }
    }

    const { count: logsDeleted } = await prisma.log.deleteMany();
    await logEvent({ action: 'DASHBOARD_RESETADO', status: 'INFO', message: `${toRemove.length} vídeo(s) removido(s), ${logsDeleted} log(s) apagado(s).` });

    res.json({ ok: true, videosRemoved: toRemove.length, logsDeleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
