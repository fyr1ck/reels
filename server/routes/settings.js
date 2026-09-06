import express from 'express';
import multer from 'multer';
import { prisma } from '../db/prisma.js';
import { generateUpcomingSchedule } from '../services/schedulerService.js';
import { validateCoverFile, saveCoverFile, cleanupCoverIfOrphan, MAX_COVER_SIZE } from '../services/coverManager.js';
import { clearCache, getStorageUsage } from '../services/cacheManager.js';
import { logEvent } from '../services/logger.js';

const router = express.Router();
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_COVER_SIZE } });

router.get('/', async (req, res) => {
  const settings = await prisma.userSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  res.json(settings);
});

router.put('/', async (req, res) => {
  try {
    const {
      defaultCaption, useDefaultCaption, postsPerDay, keepBrowserOpen, useDefaultCover,
      cacheAutoCleanEnabled, cacheAutoCleanIntervalHours,
      scheduleMode, intervalMinutes, intervalStartMode, intervalStartAt,
    } = req.body;
    const settings = await prisma.userSettings.update({
      where: { id: 1 },
      data: {
        defaultCaption, useDefaultCaption, postsPerDay, keepBrowserOpen, useDefaultCover,
        cacheAutoCleanEnabled, cacheAutoCleanIntervalHours,
        scheduleMode, intervalMinutes, intervalStartMode, intervalStartAt,
      },
    });
    await generateUpcomingSchedule();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CAPA PADRÃO (aplicada a novos vídeos quando "useDefaultCover" está ativo)
// ============================================================

// POST /api/settings/default-cover — define/substitui a capa padrão
router.post('/default-cover', coverUpload.single('cover'), async (req, res) => {
  try {
    const validationError = validateCoverFile(req.file);
    if (validationError) return res.status(400).json({ error: validationError });

    const filename = saveCoverFile(req.file);
    const current = await prisma.userSettings.findUnique({ where: { id: 1 } });
    const oldPath = current?.defaultCoverPath;

    const settings = await prisma.userSettings.update({
      where: { id: 1 },
      data: { defaultCoverPath: filename },
    });

    if (oldPath && oldPath !== filename) await cleanupCoverIfOrphan(oldPath);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/default-cover — remove somente a configuração padrão
// (não apaga capas individuais de vídeos que já a usam como capa própria)
router.delete('/default-cover', async (req, res) => {
  try {
    const current = await prisma.userSettings.findUnique({ where: { id: 1 } });
    const oldPath = current?.defaultCoverPath;

    const settings = await prisma.userSettings.update({
      where: { id: 1 },
      data: { defaultCoverPath: null, useDefaultCover: false },
    });

    if (oldPath) await cleanupCoverIfOrphan(oldPath);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ARMAZENAMENTO / CACHE
// ============================================================

// GET /api/settings/storage — tamanhos usados (pendentes, cache, capas)
router.get('/storage', async (req, res) => {
  try {
    res.json(getStorageUsage());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/clear-cache — limpa SOMENTE arquivos temporários do app
// (nunca vídeos pendentes, banco de dados, configurações ou sessão do Instagram)
router.post('/clear-cache', async (req, res) => {
  try {
    const { itemsRemoved } = clearCache();
    const settings = await prisma.userSettings.update({ where: { id: 1 }, data: { lastCacheCleanAt: new Date() } });
    await logEvent({ action: 'CACHE_LIMPO_MANUALMENTE', status: 'INFO', message: `${itemsRemoved} item(ns) removido(s).` });
    res.json({ ok: true, itemsRemoved, storage: getStorageUsage(), settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
