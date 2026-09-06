import express from 'express';
import { prisma } from '../db/prisma.js';
import { connectInstagram, disconnectInstagram } from '../services/instagramAuth.js';
import { closeAccountContext } from '../playwright/browserManager.js';
import { generateUpcomingSchedule } from '../services/schedulerService.js';
import {
  sessionExistsFor,
  deleteSessionFor,
  refreshConnectionFlags,
} from '../services/accountManager.js';
import { logEvent } from '../services/logger.js';

const router = express.Router();

/**
 * Normaliza o @: o usuario digita com ou sem arroba, com espacos, em
 * maiusculas — tudo vira o mesmo identificador.
 */
function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

// GET /api/accounts — lista com métricas de fila por conta (os cards da referência)
router.get('/', async (req, res) => {
  try {
    await refreshConnectionFlags();

    const accounts = await prisma.account.findMany({ orderBy: { position: 'asc' } });

    const enriched = await Promise.all(
      accounts.map(async (account) => {
        const [grouped, slots, nextPub] = await Promise.all([
          prisma.video.groupBy({
            by: ['status', 'mediaType'],
            where: { accountId: account.id },
            _count: true,
          }),
          prisma.schedule.findMany({ where: { accountId: account.id, enabled: true } }),
          prisma.publication.findFirst({
            where: { accountId: account.id, status: 'SCHEDULED' },
            orderBy: { scheduledAt: 'asc' },
            include: { video: true },
          }),
        ]);

        const avail = (mediaType) =>
          grouped
            .filter((g) => g.mediaType === mediaType && ['PENDING', 'SCHEDULED'].includes(g.status))
            .reduce((sum, g) => sum + g._count, 0);

        const reels = avail('REEL');
        const stories = avail('STORY');
        const published = grouped
          .filter((g) => g.status === 'PUBLISHED')
          .reduce((sum, g) => sum + g._count, 0);

        const dailyRate =
          account.scheduleMode === 'INTERVAL'
            ? 1440 / Math.max(1, account.intervalMinutes || 5)
            : slots.length;

        return {
          ...account,
          reels,
          stories,
          published,
          slotsPerDay: slots.length,
          daysCoverage: dailyRate > 0 ? Number(((reels + stories) / dailyRate).toFixed(1)) : null,
          nextPublicationAt: nextPub?.scheduledAt || null,
          nextPublicationName: nextPub?.video?.filename || null,
          health: buildHealth(account, reels + stories, dailyRate),
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildHealth(account, available, dailyRate) {
  if (!account.connected) return { level: 'danger', label: 'DESCONECTADA' };
  if (!account.active) return { level: 'neutral', label: 'INATIVA' };
  if (available === 0) return { level: 'warning', label: 'SEM FILA' };
  if (dailyRate === 0) return { level: 'warning', label: 'SEM HORÁRIOS' };
  if (account.automationStatus !== 'ACTIVE') return { level: 'neutral', label: 'PAUSADA' };
  return { level: 'success', label: 'ATIVA' };
}

// POST /api/accounts — cadastra uma conta (a conexão é um passo separado)
router.post('/', async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    if (!username) return res.status(400).json({ error: 'Informe o @ da conta.' });
    if (!/^[a-z0-9._]{1,30}$/.test(username)) {
      return res.status(400).json({ error: 'O @ só aceita letras, números, ponto e underline.' });
    }

    const dup = await prisma.account.findUnique({ where: { username } });
    if (dup) return res.status(400).json({ error: `A conta @${username} já está cadastrada.` });

    const last = await prisma.account.findFirst({ orderBy: { position: 'desc' } });
    const account = await prisma.account.create({
      data: {
        username,
        label: req.body.label ? String(req.body.label).trim() : null,
        position: last ? last.position + 1 : 0,
      },
    });

    await logEvent({ action: 'CONTA_ADICIONADA', status: 'INFO', message: `@${username}` });
    res.status(201).json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { label, active, automationStatus, randomOrder, scheduleMode, intervalMinutes,
            defaultCaption, useDefaultCaption } = req.body;

    const data = {};
    if (label !== undefined) data.label = label ? String(label).trim() : null;
    if (active !== undefined) data.active = !!active;
    if (randomOrder !== undefined) data.randomOrder = !!randomOrder;
    if (useDefaultCaption !== undefined) data.useDefaultCaption = !!useDefaultCaption;
    if (defaultCaption !== undefined) data.defaultCaption = defaultCaption || null;

    if (automationStatus !== undefined) {
      if (!['ACTIVE', 'PAUSED', 'INTERVENTION_REQUIRED'].includes(automationStatus)) {
        return res.status(400).json({ error: 'Estado de automação inválido.' });
      }
      // Ativar sem sessão só produziria falha e pausaria tudo de novo.
      if (automationStatus === 'ACTIVE' && !sessionExistsFor(req.params.id)) {
        return res.status(400).json({ error: 'Conecte a conta ao Instagram antes de ativar a automação.' });
      }
      data.automationStatus = automationStatus;
    }

    if (scheduleMode !== undefined) {
      if (!['TIMES', 'INTERVAL'].includes(scheduleMode)) {
        return res.status(400).json({ error: 'Modo de agendamento inválido.' });
      }
      data.scheduleMode = scheduleMode;
    }

    if (intervalMinutes !== undefined) {
      const n = Number(intervalMinutes);
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        return res.status(400).json({ error: 'O intervalo deve ficar entre 1 e 1440 minutos.' });
      }
      data.intervalMinutes = Math.round(n);
    }

    const account = await prisma.account.update({ where: { id: req.params.id }, data });
    await generateUpcomingSchedule(14, account.id);
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id — remove a conta. Os vídeos dela NÃO são apagados:
// ficam sem dono e podem ser reatribuídos a outra conta pela fila.
router.delete('/:id', async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });

    const total = await prisma.account.count();
    if (total === 1) {
      return res.status(400).json({ error: 'Essa é a única conta. O app precisa de ao menos uma.' });
    }

    await closeAccountContext(account.id);
    deleteSessionFor(account.id);

    await prisma.publication.deleteMany({ where: { accountId: account.id, status: 'SCHEDULED' } });
    await prisma.video.updateMany({
      where: { accountId: account.id, status: 'SCHEDULED' },
      data: { status: 'PENDING' },
    });
    await prisma.schedule.deleteMany({ where: { accountId: account.id } });
    await prisma.video.updateMany({ where: { accountId: account.id }, data: { accountId: null } });
    await prisma.publication.updateMany({ where: { accountId: account.id }, data: { accountId: null } });

    await prisma.account.delete({ where: { id: account.id } });

    // Se a padrão saiu, promove outra — o app sempre precisa de uma padrão.
    if (account.isDefault) {
      const next = await prisma.account.findFirst({ orderBy: { position: 'asc' } });
      if (next) await prisma.account.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    await logEvent({ action: 'CONTA_REMOVIDA', status: 'INFO', message: `@${account.username}` });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/:id/default — define qual conta as telas usam por padrão
router.post('/:id/default', async (req, res) => {
  try {
    await prisma.account.updateMany({ data: { isDefault: false } });
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: { isDefault: true },
    });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/:id/connect — abre o navegador para login manual.
// A senha nunca passa pelo app: quem digita é o usuário, na janela real.
router.post('/:id/connect', async (req, res) => {
  try {
    const account = await connectInstagram(req.params.id);
    res.json({ ok: true, account });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/disconnect', async (req, res) => {
  try {
    await closeAccountContext(req.params.id);
    const account = await disconnectInstagram(req.params.id);
    // Sem sessão a automação não tem como rodar; pausar evita falha em loop.
    await prisma.account.update({
      where: { id: account.id },
      data: { automationStatus: 'PAUSED' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
