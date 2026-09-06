import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { ensureDirs, DIRS } from './services/fileManager.js';
import { startSchedulerLoop } from './services/schedulerService.js';
import { startCacheAutoCleanLoop } from './services/cacheManager.js';
import { closeRenderBrowser } from './services/reelRenderer.js';
import { prisma } from './db/prisma.js';

import videosRouter from './routes/videos.js';
import scheduleRouter from './routes/schedule.js';
import settingsRouter from './routes/settings.js';
import automationRouter from './routes/automation.js';
import instagramRouter from './routes/instagram.js';
import publicationsRouter from './routes/publications.js';
import logsRouter from './routes/logs.js';
import dashboardRouter from './routes/dashboard.js';
import reelEditorRouter from './routes/reelEditor.js';
import storageRouter from './routes/storage.js';
import libraryRouter from './routes/library.js';
import operationRouter from './routes/operation.js';

const app = express();
const PORT = process.env.PORT || 3001;

ensureDirs();

app.use(cors());
app.use(express.json());

app.use('/api/videos', videosRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/automation', automationRouter);
app.use('/api/instagram', instagramRouter);
app.use('/api/publications', publicationsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reel-editor', reelEditorRouter);
app.use('/api/storage', storageRouter);
app.use('/api/library', libraryRouter);
app.use('/api/operation', operationRouter);

// Serve as imagens de capa (individuais e padrão) diretamente do disco.
// Sistema de capa personalizada — ver server/services/coverManager.js.
app.use('/api/covers', express.static(path.resolve(DIRS.covers)));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Middleware de tratamento de erros — captura falhas não tratadas nas rotas
// (ex: multer, prisma) e devolve JSON consistente em vez de derrubar o processo.
app.use((err, req, res, next) => {
  console.error('Erro não tratado na API:', err);
  const message = err?.code === 'LIMIT_FILE_SIZE'
    ? 'Arquivo muito grande.'
    : (err.message || 'Erro interno do servidor.');
  res.status(err?.code === 'LIMIT_FILE_SIZE' ? 400 : 500).json({ error: message });
});

// Em produção (npm run build && npm start), o Express também serve o build
// estático do React, permitindo rodar tudo em uma única porta.
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve('client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

async function bootstrap() {
  // Garante que sempre exista uma linha de UserSettings (id fixo = 1)
  await prisma.userSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  startCacheAutoCleanLoop(prisma);

  app.listen(PORT, () => {
    console.log(`✅ API rodando em http://localhost:${PORT}`);
    console.log('   Painel (dev): http://localhost:3000');
  });

  // Se a automação estava ativa antes do servidor reiniciar, retoma o loop
  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
  if (settings?.automationEnabled && settings.automationStatus === 'ACTIVE') {
    startSchedulerLoop();
    console.log('▶ Automação retomada automaticamente (estava ativa antes do reinício).');
  }
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\nEncerrando servidor...');
  await closeRenderBrowser();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem tratamento:', reason);
});
