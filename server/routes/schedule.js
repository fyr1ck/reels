import express from 'express';
import { prisma } from '../db/prisma.js';
import { generateUpcomingSchedule } from '../services/schedulerService.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const schedules = await prisma.schedule.findMany({ orderBy: { time: 'asc' } });
  res.json(schedules);
});

router.post('/', async (req, res) => {
  try {
    const { time } = req.body;
    if (!/^\d{2}:\d{2}$/.test(time || '')) {
      return res.status(400).json({ error: 'Horário inválido. Use o formato HH:mm.' });
    }
    const dup = await prisma.schedule.findFirst({ where: { time } });
    if (dup) return res.status(400).json({ error: 'Esse horário já está cadastrado.' });

    const schedule = await prisma.schedule.create({ data: { time } });
    await generateUpcomingSchedule();
    res.status(201).json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { enabled } = req.body;
    const schedule = await prisma.schedule.update({ where: { id: Number(req.params.id) }, data: { enabled } });
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
