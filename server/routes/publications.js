import express from 'express';
import { prisma } from '../db/prisma.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const publications = await prisma.publication.findMany({
    include: { video: true },
    orderBy: { scheduledAt: 'desc' },
  });
  res.json(publications);
});

router.get('/calendar', async (req, res) => {
  const publications = await prisma.publication.findMany({
    include: { video: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(publications);
});

export default router;
