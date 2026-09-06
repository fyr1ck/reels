import express from 'express';
import { prisma } from '../db/prisma.js';
import { generateUpcomingSchedule } from '../services/schedulerService.js';
import { resolveAccount } from '../services/accountManager.js';

const router = express.Router();

// Horários são por conta e por tipo de mídia. Sem `accountId` na query cai na
// conta padrão, então qualquer chamada antiga continua funcionando.
router.get('/', async (req, res) => {
  const account = await resolveAccount(req.query.accountId);
  const where = { accountId: account.id };
  if (req.query.mediaType) where.mediaType = req.query.mediaType;

  const schedules = await prisma.schedule.findMany({ where, orderBy: { time: 'asc' } });
  res.json(schedules);
});

router.post('/', async (req, res) => {
  try {
    const { time, mediaType } = req.body;
    if (!/^\d{2}:\d{2}$/.test(time || '')) {
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:mm.' });
    }
    if (mediaType !== undefined && !['REEL', 'STORY'].includes(mediaType)) {
      return res.status(400).json({ error: 'Tipo de mídia inválido.' });
    }

    const account = await resolveAccount(req.body.accountId);
    const tipo = mediaType || 'REEL';

    // Mesmo horário pode existir para REEL e para STORY na mesma conta — são
    // grades independentes, como na referência.
    const dup = await prisma.schedule.findFirst({
      where: { time, accountId: account.id, mediaType: tipo },
    });
    if (dup) return res.status(400).json({ error: 'Esse horário já está cadastrado para esse tipo.' });

    const schedule = await prisma.schedule.create({
      data: { time, accountId: account.id, mediaType: tipo },
    });
    await generateUpcomingSchedule(14, account.id);
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { enabled, jitterMinutes } = req.body;

    // Monta o patch só com o que veio no corpo: chamadas antigas que enviam
    // apenas { enabled } continuam funcionando sem zerar o jitter.
    const data = {};
    if (enabled !== undefined) data.enabled = !!enabled;
    if (jitterMinutes !== undefined) {
      const n = Number(jitterMinutes);
      if (!Number.isFinite(n) || n < 0 || n > 120) {
        return res.status(400).json({ error: 'Variação deve ficar entre 0 e 120 minutos.' });
      }
      data.jitterMinutes = Math.round(n);
    }

    const schedule = await prisma.schedule.update({ where: { id: Number(req.params.id) }, data });
    await generateUpcomingSchedule();
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.schedule.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
