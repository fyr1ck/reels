import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db/prisma.js';
import { DIRS, ensureDirs } from '../services/fileManager.js';
import { getVideoMetadata } from '../utils/videoMeta.js';
import { generateUpcomingSchedule } from '../services/schedulerService.js';
import { logEvent } from '../services/logger.js';
import { publishVideo } from '../services/instagramPublisher.js';
import { moveVideoFile } from '../services/fileManager.js';
import { validateCoverFile, saveCoverFile, cleanupCoverIfOrphan, resolveEffectiveCoverPath, MAX_COVER_SIZE } from '../services/coverManager.js';

ensureDirs();
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRS.pending),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = /video\/(mp4|quicktime|x-matroska|webm)/.test(file.mimetype);
    cb(ok ? null : new Error('Formato de vídeo não suportado.'), ok);
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB por vídeo
});

// Upload de capa: guardado em memória para permitir validação/hash antes de
// gravar em disco (dedup — ver server/services/coverManager.js).
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_SIZE },
});

// GET /api/videos?status=PENDING|SCHEDULED|PUBLISHING|PUBLISHED|FAILED|ALL
router.get('/', async (req, res) => {
  const { status } = req.query;
  const where = status && status !== 'ALL' ? { status } : {};
  const videos = await prisma.video.findMany({ where, orderBy: { position: 'asc' } });
  res.json(videos);
});

// POST /api/videos/upload — múltiplos vídeos de uma vez (campo "videos")
router.post('/upload', upload.array('videos', 100), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo de vídeo enviado.' });
    }

    const last = await prisma.video.findFirst({ orderBy: { position: 'desc' } });
    let position = last ? last.position + 1 : 0;

    // Se houver capa padrão configurada e ativada, novos vídeos já entram com ela.
    const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
    const applyDefaultCover = !!(settings?.useDefaultCover && settings?.defaultCoverPath);

    const created = [];
    for (const file of files) {
      const meta = await getVideoMetadata(file.path);
      const video = await prisma.video.create({
        data: {
          filename: file.originalname,
          filepath: file.path,
          duration: meta.duration,
          size: meta.size,
          position: position++,
          status: 'PENDING',
          coverPath: applyDefaultCover ? settings.defaultCoverPath : null,
        },
      });
      created.push(video);
      await logEvent({ video: video.filename, action: 'VIDEO_ADICIONADO_A_FILA', status: 'INFO' });
    }

    await generateUpcomingSchedule();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/videos/reorder — body: { order: [{id, position}, ...] }
router.put('/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Payload inválido.' });
    await prisma.$transaction(
      order.map((o) => prisma.video.update({ where: { id: o.id }, data: { position: o.position } }))
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/videos/:id — atualizar legenda individual
router.put('/:id', async (req, res) => {
  try {
    const { caption } = req.body;
    const video = await prisma.video.update({ where: { id: req.params.id }, data: { caption } });
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id — remove da fila (nunca permite excluir já publicado)
router.delete('/:id', async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    if (video.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Não é permitido excluir vídeos já publicados.' });
    }
    await prisma.publication.deleteMany({ where: { videoId: video.id } });
    await prisma.video.delete({ where: { id: video.id } });
    if (fs.existsSync(video.filepath)) fs.unlinkSync(video.filepath);
    if (video.coverPath) await cleanupCoverIfOrphan(video.coverPath);
    await logEvent({ video: video.filename, action: 'VIDEO_REMOVIDO_DA_FILA', status: 'INFO' });
    await generateUpcomingSchedule();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/bulk-delete — remove vários vídeos de uma vez (botão
// "Excluir selecionados"). Ignora silenciosamente vídeos já publicados.
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Nenhum vídeo selecionado.' });
    }
    let deleted = 0;
    const skipped = [];
    for (const id of ids) {
      const video = await prisma.video.findUnique({ where: { id } });
      if (!video) continue;
      if (video.status === 'PUBLISHED') { skipped.push(video.filename); continue; }
      await prisma.publication.deleteMany({ where: { videoId: video.id } });
      await prisma.video.delete({ where: { id: video.id } });
      if (fs.existsSync(video.filepath)) fs.unlinkSync(video.filepath);
      if (video.coverPath) await cleanupCoverIfOrphan(video.coverPath);
      await logEvent({ video: video.filename, action: 'VIDEO_REMOVIDO_DA_FILA', status: 'INFO' });
      deleted++;
    }
    await generateUpcomingSchedule();
    res.json({ ok: true, deleted, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SISTEMA DE CAPA PERSONALIZADA
// ============================================================

// POST /api/videos/:id/cover — define a capa de um vídeo específico.
// Campo de arquivo: "cover". Campo "applyToAll" = "true" aplica a mesma
// imagem a todos os vídeos PENDENTES da fila (nunca aos já publicados).
router.post('/:id/cover', coverUpload.single('cover'), async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    if (video.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Não é possível alterar a capa de um vídeo já publicado.' });
    }

    const validationError = validateCoverFile(req.file);
    if (validationError) return res.status(400).json({ error: validationError });

    const filename = saveCoverFile(req.file);
    const applyToAll = req.body.applyToAll === 'true' || req.body.applyToAll === true;

    if (applyToAll) {
      const pending = await prisma.video.findMany({ where: { status: 'PENDING' } });
      const oldPaths = [...new Set(pending.map((v) => v.coverPath).filter((p) => p && p !== filename))];

      await prisma.video.updateMany({ where: { status: 'PENDING' }, data: { coverPath: filename, coverEnabled: true } });
      for (const oldPath of oldPaths) await cleanupCoverIfOrphan(oldPath);

      await logEvent({ action: 'CAPA_APLICADA_A_TODOS', status: 'INFO', message: `${pending.length} vídeo(s) pendente(s) atualizados.` });
      return res.json({ ok: true, appliedTo: pending.length, coverPath: filename });
    }

    const oldPath = video.coverPath;
    const updated = await prisma.video.update({ where: { id: video.id }, data: { coverPath: filename, coverEnabled: true } });
    if (oldPath && oldPath !== filename) await cleanupCoverIfOrphan(oldPath);

    await logEvent({ video: video.filename, action: 'CAPA_DEFINIDA', status: 'INFO' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/videos/:id/cover — remove a capa individual de um vídeo
// (nunca mexe na capa de outros vídeos nem na capa padrão).
router.delete('/:id/cover', async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    if (video.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Não é possível alterar a capa de um vídeo já publicado.' });
    }

    const oldPath = video.coverPath;
    const updated = await prisma.video.update({ where: { id: video.id }, data: { coverPath: null } });
    if (oldPath) await cleanupCoverIfOrphan(oldPath);

    await logEvent({ video: video.filename, action: 'CAPA_REMOVIDA', status: 'INFO' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/:id/publish-now — publica IMEDIATAMENTE, fora do
// agendamento, para o usuário testar se a automação está funcionando.
// Faz UMA única tentativa (sem retry automático) e retorna o resultado
// na hora, para feedback rápido no botão do painel.
router.post('/:id/publish-now', async (req, res) => {
  try {
    const video = await prisma.video.findUnique({ where: { id: req.params.id } });
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });
    if (video.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Este vídeo já foi publicado.' });
    }

    const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
    const caption = video.caption || (settings?.useDefaultCaption ? settings.defaultCaption : '');
    const coverPath = await resolveEffectiveCoverPath(video);

    await prisma.video.update({ where: { id: video.id }, data: { status: 'PUBLISHING' } });
    await logEvent({ video: video.filename, action: 'PUBLICACAO_MANUAL_INICIADA', status: 'INFO', message: 'Teste manual disparado pelo painel (fora do agendamento).' });

    const result = await publishVideo({ filepath: video.filepath, caption, videoName: video.filename, coverPath });

    const newPath = moveVideoFile(video.filepath, 'published');
    await prisma.video.update({
      where: { id: video.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), filepath: newPath },
    });
    if (video.coverPath) await cleanupCoverIfOrphan(video.coverPath);
    await logEvent({ video: video.filename, action: 'PUBLICACAO_MANUAL_CONCLUIDA', status: 'SUCCESS', durationMs: result.durationMs });

    res.json({ ok: true, ...result });
  } catch (err) {
    await prisma.video.update({ where: { id: req.params.id }, data: { status: 'FAILED', failedAt: new Date() } }).catch(() => {});
    await logEvent({ video: req.params.id, action: 'PUBLICACAO_MANUAL_FALHOU', status: 'ERROR', message: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/:id/stream — serve o arquivo para o player <video>
router.get('/:id/stream', async (req, res) => {
  const video = await prisma.video.findUnique({ where: { id: req.params.id } });
  if (!video || !fs.existsSync(video.filepath)) return res.status(404).end();
  res.sendFile(path.resolve(video.filepath));
});

export default router;
