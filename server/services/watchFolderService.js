import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { DIRS, ensureDirs, uniqueFilename } from './fileManager.js';
import { getVideoMetadata } from '../utils/videoMeta.js';
import { logEvent } from './logger.js';
import { generateUpcomingSchedule } from './schedulerService.js';
import { pickCaptionForNewVideo } from './contentLibrary.js';

const SCAN_INTERVAL_MS = parseInt(process.env.WATCH_SCAN_INTERVAL_MS || '120000', 10);

// Extensoes que o publicador consegue processar. Qualquer outra coisa na
// pasta (imagem, .txt, .partial do sincronizador) e simplesmente ignorada.
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

// Um arquivo recem-tocado pode ainda estar sendo gravado — tipicamente pelo
// Google Drive/OneDrive baixando o conteudo. Importar nesse instante geraria
// um video truncado, entao ele so e considerado depois de ficar parado.
const SETTLE_MS = 15000;

let timer = null;
let scanning = false;

export function startWatchFolderLoop() {
  if (timer) return;
  timer = setInterval(() => { scanAll().catch(() => {}); }, SCAN_INTERVAL_MS);
  scanAll().catch(() => {});
}

export function stopWatchFolderLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Valida uma pasta antes de cadastrar: precisa existir, ser diretorio e
 * estar legivel. Mensagens especificas evitam o classico "erro ao salvar"
 * quando o usuario digita um caminho errado.
 */
export function validateFolder(folderPath) {
  const resolved = path.resolve(folderPath || '');
  if (!resolved) throw new Error('Informe o caminho da pasta.');

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error(`Pasta não encontrada: ${resolved}`);
  }
  if (!stat.isDirectory()) throw new Error(`O caminho não é uma pasta: ${resolved}`);

  try {
    fs.accessSync(resolved, fs.constants.R_OK);
  } catch {
    throw new Error(`Sem permissão de leitura em: ${resolved}`);
  }

  // Importar a propria pasta de trabalho do app criaria um laco: o arquivo
  // copiado para /pending seria detectado como novo na varredura seguinte.
  const videosRoot = path.resolve(process.env.VIDEOS_DIR || './videos');
  if (resolved === videosRoot || resolved.startsWith(videosRoot + path.sep)) {
    throw new Error('Essa pasta pertence ao próprio app. Escolha uma pasta de origem externa.');
  }

  return resolved;
}

/**
 * Lista os videos elegiveis de uma pasta (sem recursao — subpastas ficam de
 * fora para o comportamento ser previsivel).
 */
function listCandidates(folderPath) {
  const now = Date.now();
  const out = [];

  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (entry.name.startsWith('.') || entry.name.startsWith('~')) continue;

    const full = path.join(folderPath, entry.name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue; // sumiu entre o readdir e o stat
    }

    if (stat.size === 0) continue;
    if (now - stat.mtimeMs < SETTLE_MS) continue; // ainda sendo gravado

    // Trunca para milissegundo inteiro. O SQLite guarda REAL e a fracao se
    // perde no round-trip (1788732989112.9119 volta como ...112.912), o que
    // quebraria qualquer comparacao feita em JS. Inteiros ate 2^53 sao exatos
    // em double, entao a chave de deduplicacao fica estavel — e precisao de
    // sub-milissegundo nao significa nada aqui (o Windows nem a fornece).
    out.push({ name: entry.name, path: full, size: stat.size, mtimeMs: Math.floor(stat.mtimeMs) });
  }

  return out.sort((a, b) => a.mtimeMs - b.mtimeMs); // mais antigos primeiro
}

/**
 * Varre todas as pastas habilitadas. Erros sao isolados por pasta: uma
 * unidade de rede offline nao impede as outras de importar.
 */
export async function scanAll() {
  if (scanning) return { skipped: true };
  scanning = true;

  try {
    const folders = await prisma.watchFolder.findMany({ where: { enabled: true } });
    let totalImported = 0;

    for (const folder of folders) {
      const result = await scanFolder(folder);
      totalImported += result.imported;
    }

    // Só regenera o agendamento se algo realmente entrou na fila.
    if (totalImported > 0) await generateUpcomingSchedule();

    return { imported: totalImported, folders: folders.length };
  } finally {
    scanning = false;
  }
}

/**
 * Varre uma pasta e importa o que ainda nao foi importado.
 * Cada arquivo e tratado isoladamente — um video corrompido nao aborta o lote.
 */
export async function scanFolder(folder) {
  ensureDirs();
  let imported = 0;

  try {
    const candidates = listCandidates(folder.path);

    for (const file of candidates) {
      const already = await prisma.importedFile.findUnique({
        where: {
          watchFolderId_sourcePath_size_mtimeMs: {
            watchFolderId: folder.id,
            sourcePath: file.path,
            size: file.size,
            mtimeMs: file.mtimeMs,
          },
        },
      });
      if (already) continue;

      try {
        await importOne(folder, file);
        imported += 1;
      } catch (err) {
        await logEvent({
          video: file.name,
          action: 'IMPORTACAO_FALHOU',
          status: 'ERROR',
          message: `${file.path}: ${err.message}`,
        });
      }
    }

    await prisma.watchFolder.update({
      where: { id: folder.id },
      data: {
        lastScanAt: new Date(),
        lastError: null,
        importedCount: { increment: imported },
      },
    });
  } catch (err) {
    await prisma.watchFolder.update({
      where: { id: folder.id },
      data: { lastScanAt: new Date(), lastError: err.message },
    });
    await logEvent({
      action: 'VARREDURA_FALHOU',
      status: 'ERROR',
      message: `Pasta ${folder.path}: ${err.message}`,
    });
  }

  return { imported };
}

async function importOne(folder, file) {
  const targetName = uniqueFilename(file.name);
  const targetPath = path.join(DIRS.pending, targetName);

  // Copia primeiro e só então remove a origem (quando importMode = MOVE):
  // se algo falhar no meio, o arquivo original continua intacto na pasta.
  fs.copyFileSync(file.path, targetPath);

  let meta;
  try {
    meta = await getVideoMetadata(targetPath);
  } catch (err) {
    fs.unlinkSync(targetPath); // não deixa lixo em /pending
    throw new Error(`não foi possível ler o vídeo (${err.message})`);
  }

  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
  const applyDefaultCover = !!(settings?.useDefaultCover && settings?.defaultCoverPath);

  const caption = folder.autoCaption ? await pickCaptionForNewVideo() : null;

  const last = await prisma.video.findFirst({ orderBy: { position: 'desc' } });
  const video = await prisma.video.create({
    data: {
      filename: file.name,
      filepath: targetPath,
      duration: meta.duration,
      size: meta.size,
      position: last ? last.position + 1 : 0,
      status: 'PENDING',
      caption,
      coverPath: applyDefaultCover ? settings.defaultCoverPath : null,
    },
  });

  await prisma.importedFile.create({
    data: {
      watchFolderId: folder.id,
      sourcePath: file.path,
      size: file.size,
      mtimeMs: file.mtimeMs,
      videoId: video.id,
    },
  });

  if (folder.importMode === 'MOVE') {
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      // A fila já tem o vídeo; falhar aqui só significa que o original ficou
      // na origem. O registro em ImportedFile impede a reimportação.
      await logEvent({
        video: file.name,
        action: 'ORIGEM_NAO_REMOVIDA',
        status: 'WARNING',
        message: `Importado, mas não foi possível remover ${file.path}: ${err.message}`,
      });
    }
  }

  await logEvent({
    video: file.name,
    action: 'VIDEO_IMPORTADO_DE_PASTA',
    status: 'SUCCESS',
    message: `Importado de ${folder.path}${caption ? ' com legenda da biblioteca' : ''}.`,
  });

  return video;
}

/**
 * Estatisticas de uma pasta para a UI: quantos videos elegiveis existem
 * agora e quantos ainda nao foram importados.
 */
export async function getFolderStats(folder) {
  try {
    const candidates = listCandidates(folder.path);
    const known = await prisma.importedFile.findMany({
      where: { watchFolderId: folder.id },
      select: { sourcePath: true, size: true, mtimeMs: true },
    });

    const seen = new Set(known.map((k) => `${k.sourcePath}|${k.size}|${k.mtimeMs}`));
    const novos = candidates.filter((c) => !seen.has(`${c.path}|${c.size}|${c.mtimeMs}`));

    return { reachable: true, filesInFolder: candidates.length, newFiles: novos.length };
  } catch (err) {
    return { reachable: false, filesInFolder: 0, newFiles: 0, error: err.message };
  }
}
