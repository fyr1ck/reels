import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Extrai duração (segundos) e tamanho (bytes) de um arquivo de vídeo local.
 * Se o ffprobe falhar por qualquer motivo, retorna duration: null mas não
 * quebra o fluxo de upload.
 */
export function getVideoMetadata(filepath) {
  return new Promise((resolve) => {
    let size = null;
    try {
      size = fs.statSync(filepath).size;
    } catch (e) {
      /* ignore */
    }

    ffmpeg.ffprobe(filepath, (err, data) => {
      if (err) {
        console.warn('ffprobe não conseguiu ler metadados do vídeo:', err.message);
        return resolve({ duration: null, size });
      }
      const duration = data?.format?.duration ? Number(data.format.duration) : null;
      resolve({ duration, size });
    });
  });
}
