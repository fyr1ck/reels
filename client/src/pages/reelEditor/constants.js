export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export function defaultTemplateConfig() {
  return {
    profile: {
      photoUrl: null,
      name: 'Meu Perfil',
      username: '@meuusuario',
      verified: true,
      avatarSize: 64,
      fontSize: 30,
      posX: 40,
      posY: 50,
    },
    title: {
      text: 'Digite o título ou chamada do post aqui.',
      fontSize: 34,
      fontWeight: 700,
      align: 'left',
      color: '#0b0d12',
      posX: 40,
      posY: 190,
      width: 1000,
      lineHeight: 1.25,
    },
    videoContainer: {
      x: 0,
      y: 340,
      width: 1080,
      height: 1460,
      borderRadius: 24,
      fit: 'contain', // contain | cover | blurred
      shadowEnabled: false,
      shadowBlur: 30,
      shadowOpacity: 0.35,
    },
    background: {
      type: 'color', // color | gradient | image | blurred
      color: '#ffffff',
      gradientFrom: '#141821',
      gradientTo: '#3a2f66',
      gradientAngle: 180,
      imageUrl: null,
    },
    watermark: {
      enabled: false,
      logoUrl: null,
      position: 'bottom-right',
      opacity: 0.9,
      size: 90,
      margin: 24,
    },
    audio: { preserveOriginal: true },
    export: { quality: 'balanced', filenamePattern: '{name}_editado' },
  };
}

export function mergeTemplateConfig(partial) {
  const base = defaultTemplateConfig();
  if (!partial || typeof partial !== 'object') return base;
  const out = {};
  for (const key of Object.keys(base)) {
    out[key] = { ...base[key], ...(partial[key] && typeof partial[key] === 'object' ? partial[key] : {}) };
  }
  return out;
}

export function computeContain(vidW, vidH, boxW, boxH) {
  if (!vidW || !vidH) return { width: boxW, height: boxH, offsetX: 0, offsetY: 0 };
  const scale = Math.min(boxW / vidW, boxH / vidH);
  const width = Math.min(boxW, vidW * scale);
  const height = Math.min(boxH, vidH * scale);
  return { width, height, offsetX: (boxW - width) / 2, offsetY: (boxH - height) / 2 };
}

export function computeCover(vidW, vidH, boxW, boxH) {
  if (!vidW || !vidH) return { width: boxW, height: boxH, offsetX: 0, offsetY: 0 };
  const scale = Math.max(boxW / vidW, boxH / vidH);
  const width = vidW * scale;
  const height = vidH * scale;
  return { width, height, offsetX: (boxW - width) / 2, offsetY: (boxH - height) / 2 };
}

export function computeWatermarkPosition(position, size, margin, canvasW = CANVAS_W, canvasH = CANVAS_H) {
  switch (position) {
    case 'top-left': return { x: margin, y: margin };
    case 'top-right': return { x: canvasW - size - margin, y: margin };
    case 'bottom-left': return { x: margin, y: canvasH - size - margin };
    case 'bottom-right':
    default: return { x: canvasW - size - margin, y: canvasH - size - margin };
  }
}

export const QUALITY_LABELS = {
  high: 'Qualidade alta',
  balanced: 'Qualidade equilibrada',
  small: 'Arquivo pequeno',
};

export const FIT_OPTIONS = [
  { value: 'contain', label: 'Encaixar sem cortar', desc: 'Nunca corta o vídeo — o padrão recomendado.' },
  { value: 'cover', label: 'Preencher cortando', desc: 'Preenche o container inteiro, cortando o excedente.' },
  { value: 'blurred', label: 'Fundo desfocado', desc: 'Encaixa sem cortar, com uma cópia desfocada do próprio vídeo atrás.' },
];

export const BACKGROUND_OPTIONS = [
  { value: 'color', label: 'Cor sólida' },
  { value: 'gradient', label: 'Gradiente' },
  { value: 'image', label: 'Imagem personalizada' },
  { value: 'blurred', label: 'Fundo desfocado (tela toda)' },
];
