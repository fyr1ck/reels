import fs from 'fs';
import path from 'path';
import { DIRS } from './fileManager.js';
import { logEvent } from './logger.js';

// ============================================================
// LIMPEZA DE CACHE
// ============================================================
// Diretórios considerados "cache/temporário" pelo app — SOMENTE arquivos
// intermediários gerados durante o processamento, nunca vídeos pendentes,
// banco de dados, configurações ou sessão de autenticação do Instagram.
//
// editorTmp: PNGs/quadros intermediários do Editor em Massa. Normalmente já
// são apagados ao final de cada job (ver reelJobRunner.js), mas podem ficar
// órfãos se o processo for interrompido no meio — é exatamente isso que essa
// limpeza recolhe.
const CACHE_DIRS = [DIRS.editorTmp];

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
    } catch {
      // arquivo pode ter sido removido entre o readdir e o stat — ignora
    }
  }
  return total;
}

/**
 * Uso de armazenamento por categoria (bytes), para exibir em
 * Configurações > Armazenamento.
 */
export function getStorageUsage() {
  return {
    pendingBytes: dirSizeBytes(DIRS.pending),
    cacheBytes: CACHE_DIRS.reduce((sum, d) => sum + dirSizeBytes(d), 0),
    coversBytes: dirSizeBytes(DIRS.covers),
  };
}

/**
 * Apaga o CONTEÚDO dos diretórios de cache (não os diretórios em si).
 * Nunca mexe em vídeos pendentes, banco de dados, configurações ou sessão.
 */
export function clearCache() {
  let itemsRemoved = 0;
  for (const dir of CACHE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        itemsRemoved++;
      } catch {
        // best-effort — um item que falhar não deve travar o restante
      }
    }
  }
  return { itemsRemoved };
}

/**
 * Roda em segundo plano (chamada uma vez no bootstrap do servidor) e, a
 * cada 10 minutos, confere se a limpeza automática está ativada e se o
 * intervalo configurado já passou desde a última limpeza. Se sim, limpa e
 * registra `lastCacheCleanAt`.
 */
export function startCacheAutoCleanLoop(prisma) {
  const CHECK_INTERVAL_MS = 10 * 60 * 1000;

  setInterval(async () => {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
      if (!settings?.cacheAutoCleanEnabled) return;

      const intervalMs = Math.max(1, settings.cacheAutoCleanIntervalHours) * 60 * 60 * 1000;
      const last = settings.lastCacheCleanAt ? new Date(settings.lastCacheCleanAt).getTime() : 0;
      if (Date.now() - last < intervalMs) return;

      const { itemsRemoved } = clearCache();
      await prisma.userSettings.update({ where: { id: 1 }, data: { lastCacheCleanAt: new Date() } });
      await logEvent({ action: 'CACHE_LIMPO_AUTOMATICAMENTE', status: 'INFO', message: `${itemsRemoved} item(ns) removido(s).` });
    } catch (err) {
      console.error('Falha na limpeza automática de cache:', err);
    }
  }, CHECK_INTERVAL_MS);
}
