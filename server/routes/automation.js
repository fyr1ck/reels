import express from 'express';
import { prisma } from '../db/prisma.js';
import { startSchedulerLoop, stopSchedulerLoop, generateUpcomingSchedule } from '../services/schedulerService.js';
import { resolveIntervention, isInterventionPending, getInterventionMessage } from '../services/interventionManager.js';
import { logEvent } from '../services/logger.js';
import { sessionExistsFor } from '../services/accountManager.js';

const router = express.Router();

/**
 * Estado agregado da automacao.
 *
 * Depois do multi-conta quem manda e o estado de cada Account — o scheduler
 * itera as contas executaveis e nunca le UserSettings.automationStatus. Este
 * endpoint passou a DERIVAR o estado das contas; antes ele reportava a flag
 * global, que ninguem mais consultava, e o painel exibia "ativa" com nada
 * publicando (ou o contrario).
 */
router.get('/status', async (req, res) => {
  const accounts = await prisma.account.findMany();
  const ativas = accounts.filter((a) => a.active && a.automationStatus === 'ACTIVE');
  const conectadas = accounts.filter((a) => sessionExistsFor(a.id));

  const nextPublication = await prisma.publication.findFirst({
    where: { status: 'SCHEDULED' },
    orderBy: { scheduledAt: 'asc' },
    include: { video: true },
  });

  res.json({
    automationEnabled: ativas.length > 0,
    automationStatus: ativas.length > 0 ? 'ACTIVE' : 'PAUSED',
    activeAccounts: ativas.length,
    totalAccounts: accounts.length,
    connectedAccounts: conectadas.length,
    interventionPending: isInterventionPending(),
    interventionMessage: getInterventionMessage(),
    nextPublication,
  });
});

/**
 * Chave-mestra: liga a automacao de todas as contas conectadas de uma vez.
 * O controle fino continua em /contas, conta a conta.
 */
router.post('/start', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({ where: { active: true } });
    const elegiveis = accounts.filter((a) => sessionExistsFor(a.id));

    if (elegiveis.length === 0) {
      return res.status(400).json({
        error: accounts.length === 0
          ? 'Nenhuma conta cadastrada. Adicione uma em "Contas".'
          : 'Nenhuma conta conectada ao Instagram. Conecte ao menos uma em "Contas" antes de iniciar.',
      });
    }

    await generateUpcomingSchedule();
    await prisma.account.updateMany({
      where: { id: { in: elegiveis.map((a) => a.id) } },
      data: { automationStatus: 'ACTIVE' },
    });
    // Espelha o estado global para as telas que ainda leem UserSettings.
    await prisma.userSettings.update({ where: { id: 1 }, data: { automationEnabled: true, automationStatus: 'ACTIVE' } });

    startSchedulerLoop();
    await logEvent({
      action: 'AUTOMACAO_INICIADA',
      status: 'INFO',
      message: `${elegiveis.length} conta(s) ativada(s).`,
    });
    res.json({ ok: true, activated: elegiveis.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pause', async (req, res) => {
  await prisma.account.updateMany({ data: { automationStatus: 'PAUSED' } });
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationStatus: 'PAUSED' } });
  await logEvent({ action: 'AUTOMACAO_PAUSADA', status: 'INFO' });
  res.json({ ok: true });
});

router.post('/stop', async (req, res) => {
  await prisma.account.updateMany({ data: { automationStatus: 'PAUSED' } });
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
