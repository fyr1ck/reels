import express from 'express';
import { prisma } from '../db/prisma.js';

const router = express.Router();

// Sem `accountId` devolve tudo — o comportamento anterior ao multi-conta.
// Com ele, restringe a uma conta, para o calendario de quem opera varias
// nao virar uma sopa de publicacoes de perfis diferentes no mesmo dia.
function scope(req) {
  return req.query.accountId ? { accountId: req.query.accountId } : {};
}

router.get('/', async (req, res) => {
  const publications = await prisma.publication.findMany({
    where: scope(req),
    include: { video: true, account: true },
    orderBy: { scheduledAt: 'desc' },
  });
  res.json(publications);
});

router.get('/calendar', async (req, res) => {
  const publications = await prisma.publication.findMany({
    where: scope(req),
    include: { video: true, account: true },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json(publications);
});

export default router;
