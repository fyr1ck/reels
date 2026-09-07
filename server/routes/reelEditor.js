import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db/prisma.js';
import { resolveAccount } from '../services/accountManager.js';
import { DIRS, ensureDirs, uniqueFilename } from '../services/fileManager.js';
import { defaultTemplateConfig, mergeTemplateConfig } from '../services/reelLayout.js';
import { probeVideo } from '../services/reelProcessor.js';
import { startJob, cancelJob, addJobResultsToQueue } from '../services/reelJobRunner.js';
import { logEvent } from '../services/logger.js';

ensureDirs();
const router = express.Router();

function parseTemplate(row) {
  return { ...row, config: mergeTemplateConfig(JSON.parse(row.config)) };
}

// ============================================================
// TEMPLATES
// ============================================================

router.get('/templates', async (req, res) => {
  const rows = await prisma.videoTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json(rows.map(parseTemplate));
});

router.get('/templates/:id', async (req, res) => {
  const row = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Template não encontrado.' });
  res.json(parseTemplate(row));
});

router.post('/templates', async (req, res) => {
  try {
    const { name, config } = req.body;
    const merged = mergeTemplateConfig(config || defaultTemplateConfig());
    const row = await prisma.videoTemplate.create({
      data: { name: name?.trim() || 'Novo template', config: JSON.stringify(merged) },
    });
    res.status(201).json(parseTemplate(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, config } = req.body;
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (config !== undefined) data.config = JSON.stringify(mergeTemplateConfig(config));
    const row = await prisma.videoTemplate.update({ where: { id: req.params.id }, data });
    res.json(parseTemplate(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates/:id/duplicate', async (req, res) => {
  try {
    const original = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
    if (!original) return res.status(404).json({ error: 'Template não encontrado.' });
    const row = await prisma.videoTemplate.create({
      data: { name: `${original.name} V2`, config: original.config },
    });
    res.status(201).json(parseTemplate(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await prisma.videoTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2003' || /foreign key/i.test(err.message)) {
      return res.status(400).json({ error: 'Este template já foi usado em processamentos e não pode ser excluído.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ASSETS (foto de perfil, logo, imagem de fundo)
// ============================================================

const assetUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIRS.editorAssets),
    filename: (req, file, cb) => cb(null, uniqueFilename(file.originalname)),
  }),
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('Formato de imagem não suportado (use PNG, JPG ou WEBP).'), ok);
  },
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

router.post('/assets/upload', assetUpload.single('asset'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
  res.status(201).json({ filename: req.file.filename, url: `/api/reel-editor/assets/${req.file.filename}` });
});

router.get('/assets/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const filepath = path.join(DIRS.editorAssets, safe);
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.sendFile(path.resolve(filepath));
});

// ============================================================
// VÍDEOS DE ORIGEM (biblioteca do Editor em Massa)
// ============================================================

const sourceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIRS.editorSource),
    filename: (req, file, cb) => cb(null, uniqueFilename(file.originalname)),
  }),
  fileFilter: (req, file, cb) => {
    const ok = /video\/(mp4|quicktime|x-matroska|webm)/.test(file.mimetype);
    cb(ok ? null : new Error('Formato de vídeo não suportado.'), ok);
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB por vídeo
});

router.get('/videos', async (req, res) => {
  const rows = await prisma.editorSourceVideo.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(rows);
});

// POST /api/reel-editor/videos/upload — 1 a 500 vídeos de uma vez (campo "videos")
router.post('/videos/upload', sourceUpload.array('videos', 500), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo enviado.' });
    }
    const created = [];
    for (const file of files) {
      let meta = { width: null, height: null, duration: null };
      try {
        meta = await probeVideo(file.path);
      } catch (e) {
        console.warn(`Não foi possível ler metadados de ${file.originalname}:`, e.message);
      }
      const row = await prisma.editorSourceVideo.create({
        data: {
          filename: file.originalname,
          filepath: file.path,
          duration: meta.duration,
          size: file.size,
          width: meta.width,
          height: meta.height,
        },
      });
      created.push(row);
    }
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/videos/:id/stream', async (req, res) => {
  const row = await prisma.editorSourceVideo.findUnique({ where: { id: req.params.id } });
  if (!row || !fs.existsSync(row.filepath)) return res.status(404).end();
  res.sendFile(path.resolve(row.filepath));
});

router.delete('/videos/:id', async (req, res) => {
  try {
    const row = await prisma.editorSourceVideo.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    const inUse = await prisma.processedVideo.findFirst({
      where: { sourcePath: row.filepath, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (inUse) return res.status(400).json({ error: 'Este vídeo está sendo processado em um job ativo.' });
    await prisma.editorSourceVideo.delete({ where: { id: row.id } });
    if (fs.existsSync(row.filepath)) fs.unlinkSync(row.filepath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reel-editor/videos/bulk-delete — remove vários vídeos de origem
// de uma vez (botão "Excluir selecionados"). Ignora silenciosamente vídeos
// que estejam em uso num job ativo (PENDING/PROCESSING).
router.post('/videos/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Nenhum vídeo selecionado.' });
    }
    let deleted = 0;
    const skipped = [];
    for (const id of ids) {
      const row = await prisma.editorSourceVideo.findUnique({ where: { id } });
      if (!row) continue;
      const inUse = await prisma.processedVideo.findFirst({
        where: { sourcePath: row.filepath, status: { in: ['PENDING', 'PROCESSING'] } },
      });
      if (inUse) { skipped.push(row.filename); continue; }
      await prisma.editorSourceVideo.delete({ where: { id: row.id } });
      if (fs.existsSync(row.filepath)) fs.unlinkSync(row.filepath);
      deleted++;
    }
    res.json({ ok: true, deleted, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PROCESSAMENTO EM MASSA (jobs)
// ============================================================

// GET /api/reel-editor/jobs — histórico
router.get('/jobs', async (req, res) => {
  const rows = await prisma.processingJob.findMany({
    orderBy: { createdAt: 'desc' },
    include: { template: { select: { name: true } } },
  });
  res.json(rows);
});

// GET /api/reel-editor/jobs/:id — detalhe + itens (usado para poll de progresso)
router.get('/jobs/:id', async (req, res) => {
  const row = await prisma.processingJob.findUnique({
    where: { id: req.params.id },
    include: { template: { select: { name: true } }, items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!row) return res.status(404).json({ error: 'Job não encontrado.' });
  res.json(row);
});

// POST /api/reel-editor/jobs — body: { templateId, sourceVideoIds:[], concurrency, autoQueue, autoSchedule }
router.post('/jobs', async (req, res) => {
  try {
    const { templateId, sourceVideoIds, concurrency = 2, autoQueue = false, autoSchedule = false,
            accountId = null, mediaType = 'REEL' } = req.body;
    if (!templateId) return res.status(400).json({ error: 'Selecione um template.' });
    if (!Array.isArray(sourceVideoIds) || sourceVideoIds.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um vídeo.' });
    }

    const template = await prisma.videoTemplate.findUnique({ where: { id: templateId } });
    if (!template) return res.status(404).json({ error: 'Template não encontrado.' });

    const sourceVideos = await prisma.editorSourceVideo.findMany({ where: { id: { in: sourceVideoIds } } });
    if (sourceVideos.length === 0) return res.status(400).json({ error: 'Nenhum dos vídeos selecionados foi encontrado.' });

    const job = await prisma.processingJob.create({
      data: {
        templateId,
        status: 'PENDING',
        totalVideos: sourceVideos.length,
        concurrency: Math.max(1, Math.min(4, Number(concurrency) || 2)),
        autoQueue: !!autoQueue,
        // Conta de destino do lote: define de quem serão os vídeos gerados.
        accountId: accountId || (await resolveAccount(null)).id,
        mediaType: mediaType === 'STORY' ? 'STORY' : 'REEL',
        autoSchedule: !!autoSchedule,
        items: {
          create: sourceVideos.map((v) => ({
            templateId,
            sourceFilename: v.filename,
            sourcePath: v.filepath,
            status: 'PENDING',
          })),
        },
      },
      include: { items: true },
    });

    await logEvent({
      action: 'EDITOR_MASSA_JOB_INICIADO',
      status: 'INFO',
      message: `Template "${template.name}" — ${sourceVideos.length} vídeo(s), concorrência ${job.concurrency}.`,
    });

    startJob(job.id);
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reel-editor/jobs/:id/cancel
router.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const cancelled = cancelJob(req.params.id);
    if (!cancelled) {
      return res.status(400).json({ error: 'Este job não está em execução no momento.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reel-editor/jobs/:id/add-to-queue — envia os concluídos para a fila existente
router.post('/jobs/:id/add-to-queue', async (req, res) => {
  try {
    const { autoSchedule = false } = req.body || {};
    const result = await addJobResultsToQueue(req.params.id, { autoSchedule });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reel-editor/processed-videos/:id/stream — preview do resultado
router.get('/processed-videos/:id/stream', async (req, res) => {
  const row = await prisma.processedVideo.findUnique({ where: { id: req.params.id } });
  if (!row || !row.outputPath || !fs.existsSync(row.outputPath)) return res.status(404).end();
  res.sendFile(path.resolve(row.outputPath));
});

// POST /api/reel-editor/processed-videos/:id/retry — reprocessa um único vídeo,
// sem afetar os outros itens do job (edição/repetição individual).
router.post('/processed-videos/:id/retry', async (req, res) => {
  try {
    const item = await prisma.processedVideo.findUnique({ where: { id: req.params.id }, include: { job: true } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    if (item.status === 'PROCESSING') return res.status(400).json({ error: 'Este item já está sendo processado.' });

    if (item.outputPath && fs.existsSync(item.outputPath)) {
      fs.unlinkSync(item.outputPath);
    }
    await prisma.processedVideo.update({
      where: { id: item.id },
      data: { status: 'PENDING', progress: 0, errorMessage: null, outputPath: null, outputFilename: null, addedToQueue: false, queuedVideoId: null },
    });

    // Reaproveita o runner geral: cria um "job" de retry avulso não é
    // necessário — basta rodar o mesmo processamento pontualmente.
    const { retryItem } = await import('../services/reelJobRunner.js');
    if (retryItem) {
      retryItem(item.id).catch((e) => console.error('Falha ao reprocessar item:', e));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reel-editor/processed-videos/:id — remove um resultado
router.delete('/processed-videos/:id', async (req, res) => {
  try {
    const item = await prisma.processedVideo.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    if (item.outputPath && fs.existsSync(item.outputPath)) fs.unlinkSync(item.outputPath);
    await prisma.processedVideo.delete({ where: { id: item.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
