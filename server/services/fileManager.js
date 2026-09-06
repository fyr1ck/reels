import fs from 'fs';
import path from 'path';

const VIDEOS_DIR = process.env.VIDEOS_DIR || './videos';

export const DIRS = {
  pending: path.join(VIDEOS_DIR, 'pending'),
  published: path.join(VIDEOS_DIR, 'published'),
  failed: path.join(VIDEOS_DIR, 'failed'),
  // Editor de Reels em Massa — pastas próprias, isoladas da fila de publicação.
  editorSource: path.join(VIDEOS_DIR, 'editor-source'), // vídeos originais enviados para edição
  editorOutput: path.join(VIDEOS_DIR, 'editor-output'), // vídeos já processados pelo template
  editorAssets: path.join(VIDEOS_DIR, 'editor-assets'), // fotos de perfil, logos, imagens de fundo
  editorTmp: path.join(VIDEOS_DIR, 'editor-tmp'), // PNGs intermediários gerados por job (limpos após o job)
  covers: path.join(VIDEOS_DIR, 'covers'), // capas personalizadas dos vídeos da fila (individuais e padrão)
};

export function ensureDirs() {
  Object.values(DIRS).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

/**
 * Gera um nome de arquivo único preservando a extensão original.
 * Reaproveitado por qualquer rota de upload (vídeos, fotos, logos, fundos)
 * para não duplicar a mesma lógica de nomeação em vários lugares.
 */
export function uniqueFilename(originalname) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  return `${unique}${path.extname(originalname || '')}`;
}

/**
 * Move um arquivo de vídeo para outra pasta do fluxo (published/failed).
 * NUNCA exclui o arquivo definitivamente — apenas move entre pastas.
 */
export function moveVideoFile(currentPath, targetFolder) {
  ensureDirs();
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Arquivo não encontrado para mover: ${currentPath}`);
  }
  const filename = path.basename(currentPath);
  let targetPath = path.join(DIRS[targetFolder], filename);

  // Evita sobrescrever caso já exista um arquivo com o mesmo nome no destino
  if (fs.existsSync(targetPath)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    targetPath = path.join(DIRS[targetFolder], `${base}-${Date.now()}${ext}`);
  }

  fs.renameSync(currentPath, targetPath);
  return targetPath;
}
