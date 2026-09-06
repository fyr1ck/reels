import { prisma } from '../db/prisma.js';
import { logEvent } from './logger.js';
import { publishVideo, publishStory } from './instagramPublisher.js';
import { moveVideoFile } from './fileManager.js';
import { isInterventionPending } from './interventionManager.js';
import { cleanupCoverIfOrphan, resolveEffectiveCoverPath } from './coverManager.js';
import { ensureDefaultAccount, getRunnableAccounts } from './accountManager.js';

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
 *
 * Sem `accountId` regenera TODAS as contas. Os chamadores antigos (rotas de
 * horários, settings, upload) continuam funcionando sem alteração: o efeito
 * apenas passou a abranger cada conta em vez da instalação inteira.
 */
export async function generateUpcomingSchedule(daysAhead = 14, accountId = null) {
  const accounts = accountId
    ? [await prisma.account.findUnique({ where: { id: accountId } })].filter(Boolean)
    : await prisma.account.findMany({ orderBy: { position: 'asc' } });

  if (accounts.length === 0) {
    // Banco sem contas (instalação nova antes do primeiro boot completo)
    await ensureDefaultAccount();
    return;
  }

  for (const account of accounts) {
    await generateForAccount(account, daysAhead);
  }
}

async function generateForAccount(account, daysAhead) {
  // Limpa somente os agendamentos futuros DESTA conta — as outras seguem intactas.
  const scheduledPubs = await prisma.publication.findMany({
    where: { status: 'SCHEDULED', accountId: account.id },
  });

  if (scheduledPubs.length > 0) {
    await prisma.publication.deleteMany({ where: { status: 'SCHEDULED', accountId: account.id } });
    await prisma.video.updateMany({
      where: { id: { in: scheduledPubs.map((p) => p.videoId) }, status: 'SCHEDULED' },
      data: { status: 'PENDING' },
    });
  }

  if (account.scheduleMode === 'INTERVAL') {
    return generateIntervalSchedule(account);
  }
  return generateTimesSchedule(account, daysAhead);
}

/**
 * Próximo vídeo da fila de uma conta, para um tipo de mídia.
 *
 * Com `randomOrder` ligado (a "Ordem aleatória" da referência) sorteia entre
 * os pendentes em vez de seguir a posição — útil para quem mantém um acervo
 * grande e não quer publicar sempre na mesma sequência.
 */
async function nextVideoFor(account, mediaType) {
  const where = { status: 'PENDING', accountId: account.id, mediaType };

  if (!account.randomOrder) {
    return prisma.video.findFirst({ where, orderBy: { position: 'asc' } });
  }

  const total = await prisma.video.count({ where });
  if (total === 0) return null;

  const [video] = await prisma.video.findMany({
    where,
    skip: Math.floor(Math.random() * total),
    take: 1,
  });
  return video;
}

/**
 * Modo "A cada X minutos": pega todos os vídeos PENDENTES (na ordem da
 * fila) e distribui um agendamento a cada `intervalMinutes`, começando
 * agora ou no horário configurado. Continua até acabar a fila — não cria
 * agendamentos além dos vídeos que existem.
 */
async function generateIntervalSchedule(account) {
  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });

  const pendingVideos = await prisma.video.findMany({
    where: { status: 'PENDING', accountId: account.id },
    orderBy: { position: 'asc' },
  });
  if (pendingVideos.length === 0) return;

  const intervalMs = Math.max(1, account.intervalMinutes || 5) * 60 * 1000;

  let nextSlot;
  if (settings?.intervalStartMode === 'AT' && settings?.intervalStartAt) {
    const [h, m] = settings.intervalStartAt.split(':').map(Number);
    const candidate = new Date();
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() < Date.now()) candidate.setDate(candidate.getDate() + 1);
    nextSlot = candidate;
  } else {
    nextSlot = new Date();
  }

  for (const video of pendingVideos) {
    await prisma.publication.create({
      data: { videoId: video.id, accountId: account.id, scheduledAt: nextSlot, status: 'SCHEDULED' },
    });
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
 *
 * Cada horário tem um `mediaType`: uma grade de REEL e outra de STORY podem
 * conviver na mesma conta, como na referência ("Reels em Massa" e "Stories
 * em Massa" são telas separadas).
 */
async function generateTimesSchedule(account, daysAhead) {
  const schedules = await prisma.schedule.findMany({
    where: { enabled: true, accountId: account.id },
    orderBy: { time: 'asc' },
  });
  if (schedules.length === 0) return;

  // Sem vídeos de um tipo, nem adianta percorrer os dias procurando slot.
  const exhausted = new Set();

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);

    for (const sch of schedules) {
      const mediaType = sch.mediaType || 'REEL';
      if (exhausted.has(mediaType)) continue;

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
        where: {
          accountId: account.id,
          // Filtra pelo tipo através do vídeo: sem isso, um reel agendado às
          // 09:00 "ocupava" o slot das 09:00 da grade de stories, que só
          // começava a ser preenchida depois que os reels acabassem. As duas
          // grades são independentes — podem coincidir no mesmo horário.
          video: { mediaType },
          ...(jitterMs > 0
            ? {
                scheduledAt: {
                  gte: new Date(slotAt.getTime() - jitterMs),
                  lte: new Date(slotAt.getTime() + jitterMs),
                },
              }
            : { scheduledAt: slotAt }),
        },
      });
      if (exists) continue;

      const scheduledAt = applyJitter(slotAt, sch.jitterMinutes);

      const nextVideo = await nextVideoFor(account, mediaType);
      if (!nextVideo) {
        exhausted.add(mediaType);
        continue; // acabaram os vídeos deste tipo; outros tipos seguem
      }

      await prisma.publication.create({
        data: { videoId: nextVideo.id, accountId: account.id, scheduledAt, status: 'SCHEDULED' },
      });
      await prisma.video.update({ where: { id: nextVideo.id }, data: { status: 'SCHEDULED' } });
    }
  }
}

/**
 * Um tick processa no máximo UMA publicação, de UMA conta.
 *
 * Serializar é proposital: o publicador dirige uma janela real de navegador,
 * e duas publicações simultâneas disputariam a mesma janela. As contas se
 * revezam entre ticks conforme o vencimento dos agendamentos.
 */
async function tick() {
  try {
    if (isPublishing || isInterventionPending()) return;

    const accounts = await getRunnableAccounts();
    if (accounts.length === 0) return;

    const due = await prisma.publication.findFirst({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
        accountId: { in: accounts.map((a) => a.id) },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { video: true, account: true },
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
 * e PAUSA a automação — somente da conta afetada, para um problema numa
 * conta não derrubar a operação das outras.
 */
async function runPublication(publication) {
  const { video, account } = publication;
  const isStory = (video.mediaType || 'REEL') === 'STORY';
  const tipo = isStory ? 'STORY' : 'REEL';
  let attempt = publication.attempts;

  await prisma.publication.update({ where: { id: publication.id }, data: { status: 'PUBLISHING' } });
  await prisma.video.update({ where: { id: video.id }, data: { status: 'PUBLISHING' } });

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const attemptStart = Date.now();
    await logEvent({
      video: video.filename,
      action: 'PUBLICACAO_INICIADA',
      status: 'INFO',
      attempt,
      message: `${tipo} em @${account?.username || '—'}`,
    });
    await prisma.publication.update({ where: { id: publication.id }, data: { attempts: attempt } });

    try {
      let result;
      if (isStory) {
        // Story não tem legenda nem capa — o fluxo é só subir e confirmar.
        result = await publishStory({
          filepath: video.filepath,
          videoName: video.filename,
          accountId: account?.id,
        });
      } else {
        const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
        const fallbackCaption = account?.useDefaultCaption
          ? (account.defaultCaption ?? (settings?.useDefaultCaption ? settings.defaultCaption : ''))
          : '';
        const caption = video.caption || fallbackCaption;
        const coverPath = await resolveEffectiveCoverPath(video);

        result = await publishVideo({
          filepath: video.filepath,
          caption,
          videoName: video.filename,
          coverPath,
          accountId: account?.id,
        });
      }

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
          message: `${tipo} em @${account?.username || '—'}`,
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

  // Esgotadas as tentativas: move para /failed e pausa a automação da conta
  try {
    const failedPath = moveVideoFile(video.filepath, 'failed');
    await prisma.video.update({ where: { id: video.id }, data: { status: 'FAILED', failedAt: new Date(), filepath: failedPath } });
  } catch (moveErr) {
    await logEvent({ video: video.filename, action: 'ERRO_AO_MOVER_ARQUIVO', status: 'ERROR', message: moveErr.message });
  }

  await prisma.publication.update({ where: { id: publication.id }, data: { status: 'FAILED' } });

  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { automationStatus: 'PAUSED' } });
  }
  // Mantém o estado global em sincronia para o Dashboard, que ainda o lê.
  await prisma.userSettings.update({ where: { id: 1 }, data: { automationStatus: 'PAUSED' } });

  await logEvent({
    video: video.filename,
    action: 'PUBLICACAO_FALHOU_DEFINITIVAMENTE',
    status: 'ERROR',
    message: `Falhou após ${MAX_ATTEMPTS} tentativas em @${account?.username || '—'}. Automação dessa conta pausada — revise o vídeo em Fila > Falhados e retome manualmente.`,
  });
}
