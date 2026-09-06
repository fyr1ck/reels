import express from 'express';
import { prisma } from '../db/prisma.js';
import {
  applyLibraryToQueue,
  normalizeHashtags,
  composeCaption,
  MAX_HASHTAGS,
} from '../services/contentLibrary.js';

const router = express.Router();

// ============================================================
// LEGENDAS
// ============================================================

router.get('/captions', async (req, res) => {
  const captions = await prisma.captionTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(captions);
});

router.post('/captions', async (req, res) => {
  try {
    const { text, label, weight } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'A legenda não pode ficar vazia.' });
    }
    const caption = await prisma.captionTemplate.create({
      data: {
        text: String(text).trim(),
        label: label ? String(label).trim() : null,
        weight: clampWeight(weight),
      },
    });
    res.status(201).json(caption);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/captions/:id', async (req, res) => {
  try {
    const { text, label, weight, enabled } = req.body;
    const data = {};
    if (text !== undefined) {
      if (!String(text).trim()) return res.status(400).json({ error: 'A legenda não pode ficar vazia.' });
      data.text = String(text).trim();
    }
    if (label !== undefined) data.label = label ? String(label).trim() : null;
    if (weight !== undefined) data.weight = clampWeight(weight);
    if (enabled !== undefined) data.enabled = !!enabled;

    const caption = await prisma.captionTemplate.update({ where: { id: req.params.id }, data });
    res.json(caption);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/captions/:id', async (req, res) => {
  try {
    await prisma.captionTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GRUPOS DE HASHTAGS
// ============================================================

router.get('/hashtags', async (req, res) => {
  const groups = await prisma.hashtagGroup.findMany({ orderBy: { createdAt: 'desc' } });
  // Devolve tambem a versao normalizada, para a UI mostrar exatamente o
  // que sera publicado (sem duplicatas, com # e dentro do limite).
  res.json(
    groups.map((g) => {
      const tags = normalizeHashtags(g.hashtags);
      return { ...g, parsed: tags, count: tags.length, overLimit: tags.length > MAX_HASHTAGS };
    })
  );
});

router.post('/hashtags', async (req, res) => {
  try {
    const { name, hashtags } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Dê um nome ao grupo.' });
    }
    if (normalizeHashtags(hashtags).length === 0) {
      return res.status(400).json({ error: 'Informe ao menos uma hashtag válida.' });
    }
    const group = await prisma.hashtagGroup.create({
      data: { name: String(name).trim(), hashtags: String(hashtags) },
    });
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/hashtags/:id', async (req, res) => {
  try {
    const { name, hashtags, enabled } = req.body;
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Dê um nome ao grupo.' });
      data.name = String(name).trim();
    }
    if (hashtags !== undefined) {
      if (normalizeHashtags(hashtags).length === 0) {
        return res.status(400).json({ error: 'Informe ao menos uma hashtag válida.' });
      }
      data.hashtags = String(hashtags);
    }
    if (enabled !== undefined) data.enabled = !!enabled;

    const group = await prisma.hashtagGroup.update({ where: { id: req.params.id }, data });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/hashtags/:id', async (req, res) => {
  try {
    await prisma.hashtagGroup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// APLICACAO EM LOTE
// ============================================================

// POST /api/library/preview — simula sem gravar nada no banco.
router.post('/preview', async (req, res) => {
  try {
    const result = await applyLibraryToQueue({ ...req.body, dryRun: true });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/library/apply — grava as legendas montadas em Video.caption.
// Nao mexe em agendamento, arquivos nem status: so no texto.
router.post('/apply', async (req, res) => {
  try {
    const result = await applyLibraryToQueue({ ...req.body, dryRun: false });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/library/compose?text=..&hashtags=.. — utilitario de preview vivo
// usado pelo editor da pagina, sem persistir.
router.get('/compose', (req, res) => {
  const tags = normalizeHashtags(req.query.hashtags);
  res.json({
    caption: composeCaption(req.query.text, tags),
    hashtags: tags,
    count: tags.length,
    maxHashtags: MAX_HASHTAGS,
  });
});

function clampWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

export default router;
