import express from 'express';
import { prisma } from '../db/prisma.js';
import {
  validateFolder,
  scanAll,
  scanFolder,
  getFolderStats,
} from '../services/watchFolderService.js';

const router = express.Router();

// GET /api/watch-folders — pastas cadastradas + estado atual do disco
router.get('/', async (req, res) => {
  try {
    const folders = await prisma.watchFolder.findMany({ orderBy: { createdAt: 'asc' } });
    const withStats = await Promise.all(
      folders.map(async (f) => ({ ...f, ...(await getFolderStats(f)) }))
    );
    res.json(withStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watch-folders — cadastra uma pasta de origem
router.post('/', async (req, res) => {
  try {
    const { path: folderPath, label, importMode, autoCaption } = req.body;
    const resolved = validateFolder(folderPath);

    const dup = await prisma.watchFolder.findUnique({ where: { path: resolved } });
    if (dup) return res.status(400).json({ error: 'Essa pasta já está sendo monitorada.' });

    const folder = await prisma.watchFolder.create({
      data: {
        path: resolved,
        label: label ? String(label).trim() : null,
        importMode: importMode === 'MOVE' ? 'MOVE' : 'COPY',
        autoCaption: !!autoCaption,
      },
    });
    res.status(201).json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { enabled, label, importMode, autoCaption } = req.body;
    const data = {};
    if (enabled !== undefined) data.enabled = !!enabled;
    if (label !== undefined) data.label = label ? String(label).trim() : null;
    if (importMode !== undefined) data.importMode = importMode === 'MOVE' ? 'MOVE' : 'COPY';
    if (autoCaption !== undefined) data.autoCaption = !!autoCaption;

    const folder = await prisma.watchFolder.update({ where: { id: req.params.id }, data });
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/watch-folders/:id — para de monitorar. Não apaga nada da
// pasta de origem nem os vídeos que já entraram na fila.
router.delete('/:id', async (req, res) => {
  try {
    await prisma.watchFolder.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watch-folders/scan — varre tudo agora, sem esperar o intervalo
router.post('/scan', async (req, res) => {
  try {
    res.json(await scanAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/watch-folders/:id/scan — varre apenas uma pasta
router.post('/:id/scan', async (req, res) => {
  try {
    const folder = await prisma.watchFolder.findUnique({ where: { id: req.params.id } });
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });
    res.json(await scanFolder(folder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
