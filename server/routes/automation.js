import express from 'express';
import { prisma } from '../db/prisma.js';
import { startSchedulerLoop, stopSchedulerLoop, generateUpcomingSchedule } from '../services/schedulerService.js';
import { resolveIntervention, isInterventionPending, getInterventionMessage } from '../services/interventionManager.js';
import { logEvent } from '../services/logger.js';

const router = express.Router();

router.get('/status', async (req, res) => {
  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
  const nextPublication = await prisma.publication.findFirst({
    where: { status: 'SCHEDULED' },
    orderBy: { scheduledAt: 'asc' },
    include: { video: true },
  });
  res.json({
    automationEnabled: settings?.automationEnabled || false,
    automationStatus: settings?.automationStatus || 'PAUSED',
    interventionPending: isInterventionPending(),
    interventionMessage: getInterventionMessage(),
    nextPublication,
  });
});

router.post('/start', async (req, res) => {
  try {
    await generateUpcomingSchedule();
    await prisma.userSettings.update({ where: { id: 1 }, data: { automationEnabled: true, automationStatus: 'ACTIVE' } });
    startSchedulerLoop();
    await logEvent({ action: 'AUTOMACAO_INICIADA', status: 'INFO' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pause', async (req, res) => {
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationStatus: 'PAUSED' } });
  await logEvent({ action: 'AUTOMACAO_PAUSADA', status: 'INFO' });
  res.json({ ok: true });
});

router.post('/stop', async (req, res) => {
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationEnabled: false, automationStatus: 'PAUSED' } });
  stopSchedulerLoop();
  await logEvent({ action: 'AUTOMACAO_PARADA', status: 'INFO' });
  res.json({ ok: true });
});

router.post('/resolve-intervention', async (req, res) => {
  const resolved = resolveIntervention();
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationStatus: 'ACTIVE' } });
  await logEvent({ action: 'INTERVENCAO_RESOLVIDA_PELO_USUARIO', status: 'INFO' });
  res.json({ ok: resolved });
});

export default router;
