import { prisma } from '../db/prisma.js';
import { logEvent } from './logger.js';
import { publishVideo } from './instagramPublisher.js';
import { moveVideoFile } from './fileManager.js';
import { isInterventionPending } from './interventionManager.js';
import { cleanupCoverIfOrphan, resolveEffectiveCoverPath } from './coverManager.js';

const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || '3', 10);
const INTERVAL_MS = parseInt(process.env.SCHEDULER_INTERVAL_MS || '15000', 10);

let timer = null;
let isPublishing = false;

export function startSchedulerLoop() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL_MS);
  // roda uma vez imediatamente também, sem esperar o primeiro intervalo
  tick();
}

export function stopSchedulerLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Ponto de entrada único: sempre reconstrói do zero os agendamentos FUTUROS
 * (nunca mexe em Publications já PUBLISHED/FAILED) antes de regerar segundo
 * o modo atual — evita "sobras" de um modo antigo quando o usuário alterna
 * entre "Horários específicos" e "A cada X minutos", ou muda o intervalo.
 */
export async function generateUpcomingSchedule(daysAhead = 14) {
  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
  if (!settings) return;

  const scheduledPubs = await prisma.publication.findMany({ where: { status: 'SCHEDULED' } });
  if (scheduledPubs.length > 0) {
    await prisma.publication.deleteMany({ where: { status: 'SCHEDULED' } });
    await prisma.video.updateMany({
      where: { id: { in: scheduledPubs.map((p) => p.videoId) }, status: 'SCHEDULED' },
      data: { status: 'PENDING' },
    });
  }

  if (settings.scheduleMode === 'INTERVAL') {
    return generateIntervalSchedule(settings);
  }
  return generateTimesSchedule(daysAhead);
}

/**
 * Modo "A cada X minutos": pega todos os vídeos PENDENTES (na ordem da
 * fila) e distribui um agendamento a cada `intervalMinutes`, começando
 * agora ou no horário configurado. Continua até acabar a fila — não cria
 * agendamentos além dos vídeos que existem.
 */
async function generateIntervalSchedule(settings) {
  const pendingVideos = await prisma.video.findMany({
    where: { status: 'PENDING' },
    orderBy: { position: 'asc' },
  });
  if (pendingVideos.length === 0) return;

  const intervalMs = Math.max(1, settings.intervalMinutes || 5) * 60 * 1000;

  let nextSlot;
  if (settings.intervalStartMode === 'AT' && settings.intervalStartAt) {
    const [h, m] = settings.intervalStartAt.split(':').map(Number);
    const candidate = new Date();
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() < Date.now()) candidate.setDate(candidate.getDate() + 1);
    nextSlot = candidate;
  } else {
    nextSlot = new Date();
  }

  for (const video of pendingVideos) {
    await prisma.publication.create({ data: { videoId: video.id, scheduledAt: nextSlot, status: 'SCHEDULED' } });
    await prisma.video.update({ where: { id: video.id }, data: { status: 'SCHEDULED' } });
    nextSlot = new Date(nextSlot.getTime() + intervalMs);
  }
}

/**
 * Aplica variação aleatória em torno de um horário fixo.
 *
 * Publicar sempre às 14:00:00 cravadas é um padrão obviamente robótico; com
 * jitter de 10min o post sai em algum ponto entre 13:50 e 14:10. Com
 * `jitterMinutes = 0` a função devolve o horário original intacto — o
 * comportamento padrão continua exatamente o de antes.
 */
export function applyJitter(baseDate, jitterMinutes) {
  const minutes = Math.max(0, jitterMinutes || 0);
  if (minutes === 0) return baseDate;

  const spanMs = minutes * 60 * 1000;
  const offset = Math.round((Math.random() * 2 - 1) * spanMs);
  const jittered = new Date(baseDate.getTime() + offset);

  // O sorteio pode jogar o horário para trás do agora (ex: slot daqui a 3min
  // com jitter de 10min). Nesse caso adia um minuto em vez de agendar no
  // passado, que o tick publicaria imediatamente.
  const floor = Date.now() + 60 * 1000;
  return jittered.getTime() < floor ? new Date(floor) : jittered;
}

/**
 * Modo "Horários específicos" (comportamento original): percorre os
 * próximos `daysAhead` dias e, para cada horário habilitado em Schedule,
 * garante que exista uma Publication agendada — atribuindo o próximo vídeo
 * PENDING da fila (respeitando a ordem/posição) caso ainda não haja um
 * vínculo criado para aquele horário exato.
 */
async function generateTimesSchedule(daysAhead) {
  const schedules = await prisma.schedule.findMany({ where: { enabled: true }, orderBy: { time: 'asc' } });
  if (schedules.length === 0) return;

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);

    for (const sch of schedules) {
      const [h, m] = sch.time.split(':').map(Number);
      const slotAt = new Date(day);
      slotAt.setHours(h, m, 0, 0);

      // não cria agendamento para um horário de hoje que já passou
      if (d === 0 && slotAt.getTime() < Date.now()) continue;

      // A dedupção precisa olhar para a JANELA do slot, não para o instante
      // exato: com jitter ligado o horário sorteado muda a cada regeração, e
      // um findFirst por igualdade criaria publicações duplicadas no mesmo slot.
      const jitterMs = Math.max(0, sch.jitterMinutes || 0) * 60 * 1000;
      const exists = await prisma.publication.findFirst({
        where: jitterMs > 0
          ? {
              scheduledAt: {
                gte: new Date(slotAt.getTime() - jitterMs),
                lte: new Date(slotAt.getTime() + jitterMs),
              },
            }
          : { scheduledAt: slotAt },
      });
      if (exists) continue;

      const scheduledAt = applyJitter(slotAt, sch.jitterMinutes);

      const nextVideo = await prisma.video.findFirst({
        where: { status: 'PENDING' },
        orderBy: { position: 'asc' },
      });
      if (!nextVideo) return; // acabaram os vídeos disponíveis na fila

      await prisma.publication.create({
        data: { videoId: nextVideo.id, scheduledAt, status: 'SCHEDULED' },
      });
      await prisma.video.update({ where: { id: nextVideo.id }, data: { status: 'SCHEDULED' } });
    }
  }
}

async function tick() {
  try {
    const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
    if (!settings || !settings.automationEnabled || settings.automationStatus !== 'ACTIVE') return;
    if (isPublishing || isInterventionPending()) return;

    const due = await prisma.publication.findFirst({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      include: { video: true },
    });
    if (!due) return;

    isPublishing = true;
    await runPublication(due);
  } catch (err) {
    await logEvent({ action: 'ERRO_SCHEDULER', status: 'ERROR', message: err.message });
  } finally {
    isPublishing = false;
  }
}

/**
 * Executa (com retentativas) a publicação de um único agendamento.
 * NUNCA avança silenciosamente: em caso de falha definitiva (esgotadas as
 * MAX_ATTEMPTS tentativas), move o vídeo para /failed, marca tudo no banco
 * e PAUSA a automação inteira até intervenção do usuário.
 */
async function runPublication(publication) {
  const { video } = publication;
  let attempt = publication.attempts;

  await prisma.publication.update({ where: { id: publication.id }, data: { status: 'PUBLISHING' } });
  await prisma.video.update({ where: { id: video.id }, data: { status: 'PUBLISHING' } });

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const attemptStart = Date.now();
    await logEvent({ video: video.filename, action: 'PUBLICACAO_INICIADA', status: 'INFO', attempt });
    await prisma.publication.update({ where: { id: publication.id }, data: { attempts: attempt } });

    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
      const caption = video.caption || (settings.useDefaultCaption ? settings.defaultCaption : '');
      const coverPath = await resolveEffectiveCoverPath(video);

      const result = await publishVideo({ filepath: video.filepath, caption, videoName: video.filename, coverPath });

      if (result.success) {
        const newPath = moveVideoFile(video.filepath, 'published');
        await prisma.video.update({
          where: { id: video.id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), filepath: newPath },
        });
        await prisma.publication.update({
          where: { id: publication.id },
          data: { status: 'PUBLISHED', publishedAt: new Date(), errorMessage: null },
        });
        await logEvent({
          video: video.filename,
          action: 'PUBLICACAO_CONCLUIDA',
          status: 'SUCCESS',
          attempt,
          durationMs: Date.now() - attemptStart,
        });
        // Publicação confirmada: a capa individual deixa de ser necessária
        // (a menos que ainda seja usada por outro vídeo pendente ou seja a capa padrão).
        if (video.coverPath) await cleanupCoverIfOrphan(video.coverPath);
        return;
      }
    } catch (err) {
      await logEvent({
        video: video.filename,
        action: 'PUBLICACAO_FALHOU',
        status: 'ERROR',
        message: err.message,
        attempt,
        durationMs: Date.now() - attemptStart,
      });
      await prisma.publication.update({ where: { id: publication.id }, data: { errorMessage: err.message } });
    }
  }

  // Esgotadas as tentativas: move para /failed e pausa a automação
  try {
    const failedPath = moveVideoFile(video.filepath, 'failed');
    await prisma.video.update({ where: { id: video.id }, data: { status: 'FAILED', failedAt: new Date(), filepath: failedPath } });
  } catch (moveErr) {
    await logEvent({ video: video.filename, action: 'ERRO_AO_MOVER_ARQUIVO', status: 'ERROR', message: moveErr.message });
  }

  await prisma.publication.update({ where: { id: publication.id }, data: { status: 'FAILED' } });
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationStatus: 'PAUSED' } });

  await logEvent({
    video: video.filename,
    action: 'PUBLICACAO_FALHOU_DEFINITIVAMENTE',
    status: 'ERROR',
    message: `Falhou após ${MAX_ATTEMPTS} tentativas. Automação pausada — revise o vídeo em Fila > Falhados e retome manualmente.`,
  });
}
