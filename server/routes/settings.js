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

/**
 * Valida um numero dentro de uma faixa. Devolve undefined quando o campo nao
 * veio no corpo — assim um PUT parcial nunca sobrescreve o que nao mandou.
 */
function parseRange(value, { min, max, field }) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} deve ser um número entre ${min} e ${max}.`);
  }
  return Math.round(n);
}

function parseEnum(value, allowed, field) {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    throw new Error(`${field} inválido. Valores aceitos: ${allowed.join(', ')}.`);
  }
  return value;
}

router.put('/', async (req, res) => {
  try {
    const {
      defaultCaption, useDefaultCaption, keepBrowserOpen, useDefaultCover,
      cacheAutoCleanEnabled, intervalStartAt,
    } = req.body;

    // Sem validação, a rota aceitava qualquer coisa: intervalMinutes negativo,
    // postsPerDay absurdo e scheduleMode inexistente iam direto para o banco.
    // O scheduler até sobrevivia (clampa na leitura), mas o painel passava a
    // exibir valores impossíveis e o modo inválido caía silenciosamente em TIMES.
    const data = {
      defaultCaption,
      useDefaultCaption: useDefaultCaption === undefined ? undefined : !!useDefaultCaption,
      keepBrowserOpen: keepBrowserOpen === undefined ? undefined : !!keepBrowserOpen,
      useDefaultCover: useDefaultCover === undefined ? undefined : !!useDefaultCover,
      cacheAutoCleanEnabled:
        cacheAutoCleanEnabled === undefined ? undefined : !!cacheAutoCleanEnabled,
      postsPerDay: parseRange(req.body.postsPerDay, { min: 1, max: 50, field: 'Publicações por dia' }),
      intervalMinutes: parseRange(req.body.intervalMinutes, { min: 1, max: 1440, field: 'Intervalo' }),
      cacheAutoCleanIntervalHours: parseRange(req.body.cacheAutoCleanIntervalHours, {
        min: 1, max: 720, field: 'Intervalo de limpeza',
      }),
      scheduleMode: parseEnum(req.body.scheduleMode, ['TIMES', 'INTERVAL'], 'Modo de agendamento'),
      intervalStartMode: parseEnum(req.body.intervalStartMode, ['NOW', 'AT'], 'Início do intervalo'),
    };

    if (intervalStartAt !== undefined) {
      if (intervalStartAt && !/^\d{2}:\d{2}$/.test(intervalStartAt)) {
        return res.status(400).json({ error: 'Horário de início inválido. Use HH:mm.' });
      }
      data.intervalStartAt = intervalStartAt || null;
    }

    const settings = await prisma.userSettings.update({ where: { id: 1 }, data });
    await generateUpcomingSchedule();
    res.json(settings);
  } catch (err) {
    // Erros de validação são do cliente (400); o resto é falha real (500).
    const isValidation = /deve ser|inválido/i.test(err.message);
    res.status(isValidation ? 400 : 500).json({ error: err.message });
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
