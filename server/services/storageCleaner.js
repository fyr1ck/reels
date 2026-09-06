import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { DIRS } from './fileManager.js';
import { logEvent } from './logger.js';

// ============================================================
// ZONA DE RISCO — limpeza manual de pastas inteiras
// ============================================================
// Cada função aqui apaga os ARQUIVOS de uma pasta e mantém o banco de dados
// consistente com o que restou (nunca deixa um Video/EditorSourceVideo
// apontando para um arquivo que não existe mais). Nada aqui mexe na sessão
// de autenticação do Instagram nem nas configurações do usuário.

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
    } catch {
      // arquivo pode ter sido removido entre o readdir e o stat
    }
  }
  return total;
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      removed++;
    } catch {
      // best-effort — um item que falhar não deve travar o restante
    }
  }
  return removed;
}

// Mapa: identificador público (nome da pasta em disco) -> chave em DIRS
const FOLDER_DIR_KEY = {
  pending: 'pending',
  failed: 'failed',
  published: 'published',
  covers: 'covers',
  'editor-tmp': 'editorTmp',
  'editor-assets': 'editorAssets',
  'editor-source': 'editorSource',
  'editor-output': 'editorOutput',
};

export function getFullStorageUsage() {
  const usage = {};
  for (const [publicKey, dirKey] of Object.entries(FOLDER_DIR_KEY)) {
    usage[publicKey] = dirSizeBytes(DIRS[dirKey]);
  }
  return usage;
}

async function clearPendingFolder() {
  const videos = await prisma.video.findMany({ where: { status: { in: ['PENDING', 'SCHEDULED'] } } });
  for (const v of videos) {
    await prisma.publication.deleteMany({ where: { videoId: v.id } });
    await prisma.video.delete({ where: { id: v.id } });
  }
  const itemsRemoved = emptyDir(DIRS.pending);
  return { itemsRemoved, videosRemoved: videos.length, blocked: null };
}

async function clearFailedFolder() {
  const videos = await prisma.video.findMany({ where: { status: 'FAILED' } });
  for (const v of videos) {
    await prisma.publication.deleteMany({ where: { videoId: v.id } });
    await prisma.video.delete({ where: { id: v.id } });
  }
  const itemsRemoved = emptyDir(DIRS.failed);
  return { itemsRemoved, videosRemoved: videos.length, blocked: null };
}

async function clearPublishedFolder() {
  // Mantém o histórico no banco (nome, legenda, data de publicação) —
  // libera apenas o espaço em disco do arquivo de vídeo já publicado.
  const videos = await prisma.video.findMany({ where: { status: 'PUBLISHED' } });
  for (const v of videos) {
    await prisma.video.update({ where: { id: v.id }, data: { filepath: '' } });
  }
  const itemsRemoved = emptyDir(DIRS.published);
  return { itemsRemoved, videosRemoved: videos.length, blocked: null };
}

async function clearCoversFolder() {
  const itemsRemoved = emptyDir(DIRS.covers);
  await prisma.video.updateMany({ where: { coverPath: { not: null } }, data: { coverPath: null } });
  await prisma.userSettings.update({ where: { id: 1 }, data: { defaultCoverPath: null, useDefaultCover: false } });
  return { itemsRemoved, blocked: null };
}

async function clearEditorTmpFolder() {
  const itemsRemoved = emptyDir(DIRS.editorTmp);
  return { itemsRemoved, blocked: null };
}

async function activeEditorJobBlockMessage() {
  const activeItems = await prisma.processedVideo.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } });
  if (activeItems > 0) {
    return 'Há vídeos sendo processados no Editor em Massa agora. Aguarde terminar (ou cancele o job) antes de limpar.';
  }
  return null;
}

async function clearEditorAssetsFolder() {
  const blocked = await activeEditorJobBlockMessage();
  if (blocked) return { itemsRemoved: 0, blocked };
  const itemsRemoved = emptyDir(DIRS.editorAssets);
  return { itemsRemoved, blocked: null };
}

async function clearEditorSourceFolder() {
  const blocked = await activeEditorJobBlockMessage();
  if (blocked) return { itemsRemoved: 0, blocked };
  const sources = await prisma.editorSourceVideo.findMany();
  await prisma.editorSourceVideo.deleteMany();
  const itemsRemoved = emptyDir(DIRS.editorSource);
  return { itemsRemoved, videosRemoved: sources.length, blocked: null };
}

async function clearEditorOutputFolder() {
  const blocked = await activeEditorJobBlockMessage();
  if (blocked) return { itemsRemoved: 0, blocked };
  await prisma.processedVideo.updateMany({ data: { outputPath: null, outputFilename: null } });
  const itemsRemoved = emptyDir(DIRS.editorOutput);
  return { itemsRemoved, blocked: null };
}

const CLEANERS = {
  pending: clearPendingFolder,
  failed: clearFailedFolder,
  published: clearPublishedFolder,
  covers: clearCoversFolder,
  'editor-tmp': clearEditorTmpFolder,
  'editor-assets': clearEditorAssetsFolder,
  'editor-source': clearEditorSourceFolder,
  'editor-output': clearEditorOutputFolder,
};

export async function clearFolder(key) {
  const fn = CLEANERS[key];
  if (!fn) throw new Error('Pasta desconhecida.');
  const result = await fn();
  await logEvent({
    action: 'PASTA_LIMPA',
    status: result.blocked ? 'WARNING' : 'INFO',
    message: `${key}: ${result.itemsRemoved} item(ns) removido(s).${result.blocked ? ` Bloqueado: ${result.blocked}` : ''}`,
  });
  return result;
}

export async function clearAllFolders() {
  const results = {};
  for (const key of Object.keys(CLEANERS)) {
    results[key] = await clearFolder(key);
  }
  return results;
}
