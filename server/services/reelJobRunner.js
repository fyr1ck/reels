import path from 'path';
import fs from 'fs';
import { prisma } from '../db/prisma.js';
import { DIRS } from './fileManager.js';
import { mergeTemplateConfig, applyFilenamePattern } from './reelLayout.js';
import { renderTemplateLayers } from './reelRenderer.js';
import { probeVideo, runFfmpegJob, cleanupDir } from './reelProcessor.js';
import { generateUpcomingSchedule } from './schedulerService.js';
import { ensureDefaultAccount } from './accountManager.js';
import { logEvent } from './logger.js';

// jobId -> { cancelled: boolean, runningCancels: Set<()=>void> }
const activeJobs = new Map();

function resolveAsset(filename) {
  if (!filename) return null;
  return path.join(DIRS.editorAssets, filename);
}

/** Dispara o processamento de um job em background (não bloqueia a requisição
 * HTTP que o criou). Erros de nível de job ficam registrados no próprio job. */
export function startJob(jobId) {
  runJob(jobId).catch(async (err) => {
    console.error(`Job ${jobId} falhou de forma inesperada:`, err);
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date() },
    }).catch(() => {});
  });
}

export function cancelJob(jobId) {
  const entry = activeJobs.get(jobId);
  if (!entry) return false;
  entry.cancelled = true;
  for (const cancelFn of entry.runningCancels) {
    try { cancelFn(); } catch { /* ignore */ }
  }
  return true;
}

export function isJobActive(jobId) {
  return activeJobs.has(jobId);
}

async function runJob(jobId) {
  const job = await prisma.processingJob.findUnique({ where: { id: jobId }, include: { template: true, items: true } });
  if (!job) return;

  const entry = { cancelled: false, runningCancels: new Set() };
  activeJobs.set(jobId, entry);

  await prisma.processingJob.update({ where: { id: jobId }, data: { status: 'PROCESSING' } });

  const config = mergeTemplateConfig(JSON.parse(job.template.config));
  const tmpDir = path.join(DIRS.editorTmp, jobId);

  try {
    const layers = await renderTemplateLayers(config, tmpDir, resolveAsset);

    const pendingItems = job.items.filter((it) => it.status === 'PENDING');
    const concurrency = Math.max(1, Math.min(4, job.concurrency || 2));

    let cursor = 0;
    const worker = async () => {
      while (true) {
        if (entry.cancelled) return;
        const myIndex = cursor++;
        if (myIndex >= pendingItems.length) return;
        const item = pendingItems[myIndex];
        await processItem(item, job, config, layers, entry);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const finalCounts = await prisma.processedVideo.groupBy({
      by: ['status'],
      where: { jobId },
      _count: true,
    });
    const counts = Object.fromEntries(finalCounts.map((c) => [c.status, c._count]));

    const finishedStatus = entry.cancelled ? 'CANCELLED' : 'COMPLETED';
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: finishedStatus,
        completedCount: counts.COMPLETED || 0,
        failedCount: counts.FAILED || 0,
        cancelledCount: counts.CANCELLED || 0,
        finishedAt: new Date(),
      },
    });

    await logEvent({
      action: 'EDITOR_MASSA_JOB_FINALIZADO',
      status: entry.cancelled ? 'WARNING' : 'SUCCESS',
      message: `Template "${job.template.name}" — ${counts.COMPLETED || 0} concluídos, ${counts.FAILED || 0} falharam, ${counts.CANCELLED || 0} cancelados.`,
    });

    // Automação: adicionar à fila / agendar automaticamente
    if (!entry.cancelled && job.autoQueue) {
      await addJobResultsToQueue(jobId, { autoSchedule: job.autoSchedule });
    }
  } finally {
    activeJobs.delete(jobId);
    cleanupDir(tmpDir);
  }
}

async function processItem(item, job, config, layers, entry) {
  await prisma.processedVideo.update({ where: { id: item.id }, data: { status: 'PROCESSING', progress: 0 } });

  try {
    const videoMeta = await probeVideo(item.sourcePath);
    const originalBase = path.parse(item.sourceFilename).name;
    const outputFilename = `${applyFilenamePattern(config.export.filenamePattern, originalBase, job.template.name)}.mp4`;
    const outputPath = path.join(DIRS.editorOutput, `${item.id}-${outputFilename}`);

    const { promise, cancel } = runFfmpegJob({
      sourcePath: item.sourcePath,
      outputPath,
      videoMeta,
      config,
      layers,
      onProgress: (pct) => {
        prisma.processedVideo.update({ where: { id: item.id }, data: { progress: pct } }).catch(() => {});
      },
    });

    entry.runningCancels.add(cancel);
    try {
      await promise;
    } finally {
      entry.runningCancels.delete(cancel);
    }

    await prisma.processedVideo.update({
      where: { id: item.id },
      data: { status: 'COMPLETED', progress: 100, outputPath, outputFilename, finishedAt: new Date() },
    });
  } catch (err) {
    if (err.message === 'CANCELLED') {
      await prisma.processedVideo.update({ where: { id: item.id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
      return;
    }
    await prisma.processedVideo.update({
      where: { id: item.id },
      data: { status: 'FAILED', errorMessage: err.message?.slice(0, 500) || 'Erro desconhecido no FFmpeg.', finishedAt: new Date() },
    });
    await logEvent({
      video: item.sourceFilename,
      action: 'EDITOR_MASSA_ITEM_FALHOU',
      status: 'ERROR',
      message: err.message?.slice(0, 500),
    });
  }
}

/**
 * Reprocessa UM único item (usado por "Tentar novamente" e por "Usar
 * novamente" / edição individual), fora do ciclo de concorrência do job
 * original — não afeta os outros vídeos do lote.
 */
export async function retryItem(processedVideoId) {
  const item = await prisma.processedVideo.findUnique({ where: { id: processedVideoId }, include: { job: { include: { template: true } } } });
  if (!item) throw new Error('Item não encontrado.');

  const jobId = item.jobId;
  let entry = activeJobs.get(jobId);
  if (!entry) {
    entry = { cancelled: false, runningCancels: new Set() };
    activeJobs.set(jobId, entry);
  }

  const config = mergeTemplateConfig(JSON.parse(item.job.template.config));
  const tmpDir = path.join(DIRS.editorTmp, `${jobId}-retry-${processedVideoId}`);

  try {
    const layers = await renderTemplateLayers(config, tmpDir, resolveAsset);
    await processItem(item, item.job, config, layers, entry);
  } finally {
    cleanupDir(tmpDir);
    if (entry.runningCancels.size === 0) {
      // só remove do mapa se não houver mais nada rodando para este job
      const stillHasPending = await prisma.processedVideo.count({ where: { jobId, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (stillHasPending === 0) activeJobs.delete(jobId);
    }
  }
}

/**
 * Move os resultados concluídos (e ainda não enviados) de um job para a
 * fila de publicação EXISTENTE (model Video) — não cria uma segunda fila.
 */
export async function addJobResultsToQueue(jobId, { autoSchedule = false } = {}) {
  const items = await prisma.processedVideo.findMany({
    where: { jobId, status: 'COMPLETED', addedToQueue: false },
  });
  if (items.length === 0) return { added: 0 };

  // Conta e tipo vêm do lote. Sem isso o vídeo nascia com accountId null e o
  // agendador — que filtra por conta — nunca o encontrava: o resultado do
  // Editor em Massa entrava na fila e ficava lá para sempre, sem publicar.
  const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
  const account = job?.accountId
    ? await prisma.account.findUnique({ where: { id: job.accountId } })
    : await ensureDefaultAccount();

  const last = await prisma.video.findFirst({ orderBy: { position: 'desc' } });
  let position = last ? last.position + 1 : 0;

  for (const item of items) {
    let size = null;
    try { size = fs.statSync(item.outputPath).size; } catch { /* ignore */ }
    const meta = await probeVideo(item.outputPath).catch(() => null);

    const video = await prisma.video.create({
      data: {
        filename: item.outputFilename,
        filepath: item.outputPath,
        duration: meta?.duration ?? null,
        size,
        position: position++,
        status: 'PENDING',
        accountId: account?.id ?? null,
        mediaType: job?.mediaType === 'STORY' ? 'STORY' : 'REEL',
      },
    });
    await prisma.processedVideo.update({ where: { id: item.id }, data: { addedToQueue: true, queuedVideoId: video.id } });
    await logEvent({ video: video.filename, action: 'EDITOR_MASSA_ADICIONADO_A_FILA', status: 'INFO' });
  }

  if (autoSchedule) {
    await generateUpcomingSchedule(14, account?.id ?? null);
  }

  return { added: items.length };
}
