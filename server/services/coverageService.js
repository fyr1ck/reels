import { prisma } from '../db/prisma.js';

/**
 * Quantas publicacoes o setup atual gera por dia.
 *
 * - modo TIMES:    um post por horario habilitado (ex: 08:00, 12:00, 18:00 = 3/dia)
 * - modo INTERVAL: 1440 minutos / intervalo (ex: a cada 60min = 24/dia)
 *
 * Retorna 0 quando nao ha nada configurado — o chamador trata como
 * "cobertura indefinida" em vez de dividir por zero.
 */
export function computeDailyRate(settings, enabledSchedules) {
  if (settings?.scheduleMode === 'INTERVAL') {
    const minutes = Math.max(1, settings.intervalMinutes || 5);
    return 1440 / minutes;
  }
  return enabledSchedules.length;
}

/**
 * Panorama da operacao: quanto conteudo existe, a que ritmo ele sai e por
 * quantos dias a fila aguenta. Somente leitura — nao altera nada.
 */
export async function getCoverage() {
  const [settings, schedules, grouped, nextPub, lastPublished] = await Promise.all([
    prisma.userSettings.findUnique({ where: { id: 1 } }),
    prisma.schedule.findMany({ where: { enabled: true }, orderBy: { time: 'asc' } }),
    prisma.video.groupBy({ by: ['status'], _count: true }),
    prisma.publication.findFirst({
      where: { status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      include: { video: true },
    }),
    prisma.video.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  const pending = counts.PENDING || 0;
  const scheduled = counts.SCHEDULED || 0;
  const published = counts.PUBLISHED || 0;
  const failed = counts.FAILED || 0;

  // Só conta o que ainda pode ir ao ar. PUBLISHED/FAILED ficam de fora.
  const availableVideos = pending + scheduled;
  const dailyRate = computeDailyRate(settings, schedules);

  const daysCoverage = dailyRate > 0 ? availableVideos / dailyRate : null;

  // Sem legenda = vai publicar com a legenda padrao (ou nenhuma). Vale
  // sinalizar porque e o erro mais comum de quem enche a fila as pressas.
  const withoutCaption = await prisma.video.count({
    where: { status: { in: ['PENDING', 'SCHEDULED'] }, OR: [{ caption: null }, { caption: '' }] },
  });

  return {
    pending,
    scheduled,
    published,
    failed,
    availableVideos,
    withoutCaption,
    scheduleMode: settings?.scheduleMode || 'TIMES',
    intervalMinutes: settings?.intervalMinutes ?? null,
    slotsPerDay: schedules.length,
    dailyRate: Number(dailyRate.toFixed(2)),
    daysCoverage: daysCoverage == null ? null : Number(daysCoverage.toFixed(1)),
    automationEnabled: !!settings?.automationEnabled,
    automationStatus: settings?.automationStatus || 'PAUSED',
    nextPublication: nextPub
      ? { scheduledAt: nextPub.scheduledAt, filename: nextPub.video?.filename || null }
      : null,
    lastPublishedAt: lastPublished?.publishedAt || null,
    // Estado resumido para o badge, no espirito do "ATIVA / SEM FILA"
    health: buildHealth({ availableVideos, dailyRate, failed, settings }),
  };
}

function buildHealth({ availableVideos, dailyRate, failed, settings }) {
  if (failed > 0) return { level: 'danger', label: 'COM FALHAS' };
  if (availableVideos === 0) return { level: 'warning', label: 'SEM FILA' };
  if (dailyRate === 0) return { level: 'warning', label: 'SEM HORÁRIOS' };
  if (!settings?.automationEnabled || settings.automationStatus !== 'ACTIVE') {
    return { level: 'neutral', label: 'PAUSADA' };
  }
  return { level: 'success', label: 'ATIVA' };
}

/**
 * Proximas publicacoes ja agendadas, em ordem cronologica.
 * Alimenta a timeline da pagina Operacao.
 */
export async function getUpcoming(limit = 12) {
  const pubs = await prisma.publication.findMany({
    where: { status: 'SCHEDULED' },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
    include: { video: true },
  });

  return pubs.map((p) => ({
    id: p.id,
    scheduledAt: p.scheduledAt,
    filename: p.video?.filename || '—',
    hasCaption: !!(p.video?.caption && p.video.caption.trim()),
  }));
}
