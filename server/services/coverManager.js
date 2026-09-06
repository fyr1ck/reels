import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../db/prisma.js';
import { DIRS } from './fileManager.js';

// ============================================================
// SISTEMA DE CAPA PERSONALIZADA — gerenciamento de arquivos
// ============================================================
// Regras (ver especificação do usuário):
// - Formatos aceitos: JPG, JPEG, PNG, WEBP.
// - Nunca duplicar fisicamente a mesma imagem: o nome do arquivo em disco é
//   o hash do conteúdo, então a mesma capa aplicada a vários vídeos aponta
//   sempre para o mesmo arquivo (referência, não cópia).
// - Um arquivo de capa só é apagado do disco quando NINGUÉM mais precisa
//   dele: nem outro vídeo da fila, nem a capa padrão das configurações.

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10MB por imagem de capa

// Confere a assinatura binária (magic bytes) do arquivo para reduzir a
// chance de aceitar um arquivo corrompido ou com extensão forjada.
function looksLikeValidImage(buffer, ext) {
  if (!buffer || buffer.length < 12) return false;
  if (ext === '.png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === '.webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

/**
 * Valida um arquivo de capa recebido via multer (memoryStorage).
 * Retorna uma mensagem de erro (string) ou null se estiver tudo certo.
 */
export function validateCoverFile(file) {
  if (!file || !file.buffer || file.buffer.length === 0) return 'Não foi possível carregar a imagem.';
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.mimetype)) {
    return 'Formato inválido. Use JPG, JPEG, PNG ou WEBP.';
  }
  if (file.size > MAX_COVER_SIZE) {
    return `Arquivo muito grande. O tamanho máximo é ${MAX_COVER_SIZE / (1024 * 1024)}MB.`;
  }
  if (!looksLikeValidImage(file.buffer, ext)) return 'Não foi possível carregar a imagem.';
  return null;
}

/**
 * Salva a capa em disco reaproveitando o arquivo se o mesmo conteúdo já
 * existir (dedup por hash) e devolve apenas o nome do arquivo salvo em
 * server/videos/covers — é esse nome que fica gravado em `coverPath`.
 */
export function saveCoverFile(file) {
  fs.mkdirSync(DIRS.covers, { recursive: true });
  const ext = path.extname(file.originalname || '').toLowerCase();
  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const filename = `${hash}${ext}`;
  const targetPath = path.join(DIRS.covers, filename);
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, file.buffer);
  }
  return filename;
}

/**
 * Resolve o caminho absoluto da capa que deve ser usada na publicação deste
 * vídeo, seguindo a prioridade da especificação:
 *   1. Capa individual do vídeo
 *   2. Capa padrão configurada
 *   3. Nenhuma (deixa o Instagram sugerir a própria capa)
 * Retorna null quando não há nenhuma capa personalizada aplicável.
 */
export async function resolveEffectiveCoverPath(video) {
  const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
  const filename = video.coverPath || settings?.defaultCoverPath || null;
  if (!filename) return null;
  const absolutePath = path.join(DIRS.covers, filename);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

/**
 * Apaga o arquivo físico de uma capa SOMENTE se ela não estiver mais em uso
 * — nem como capa individual de outro vídeo, nem como capa padrão atual.
 * Deve ser chamada sempre que uma capa individual é substituída, removida,
 * ou quando o vídeo dono dela é excluído/publicado.
 */
export async function cleanupCoverIfOrphan(filename) {
  if (!filename) return;
  try {
    const settings = await prisma.userSettings.findUnique({ where: { id: 1 } });
    if (settings?.defaultCoverPath === filename) return; // ainda é a capa padrão configurada

    const stillUsed = await prisma.video.findFirst({ where: { coverPath: filename } });
    if (stillUsed) return; // outro vídeo ainda referencia essa mesma imagem

    const filePath = path.join(DIRS.covers, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // limpeza é best-effort — nunca deve derrubar o fluxo principal
  }
}
