import { prisma } from '../db/prisma.js';
import { logEvent } from './logger.js';

// Limite de hashtags por publicacao imposto pelo proprio Instagram.
export const MAX_HASHTAGS = 30;

/**
 * Normaliza um texto livre de hashtags para uma lista limpa.
 * Aceita o que o usuario digitar ("#futebol, gols  #Copa", uma por linha,
 * com ou sem #) e devolve algo publicavel: sem duplicatas, sem pontuacao
 * solta e sempre prefixado com #.
 */
export function normalizeHashtags(raw) {
  const tokens = String(raw || '').split(/[\s,;\n\r]+/);
  const seen = new Set();
  const out = [];

  for (const token of tokens) {
    // remove os # do inicio e tudo que nao for letra/numero/underscore
    const clean = token.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!clean) continue;

    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${clean}`);
  }

  return out;
}

/**
 * Expande uma lista de itens repetindo cada um conforme seu `weight`.
 * Um item com weight 3 entra 3x no sorteio — e assim aparece ~3x mais que
 * um item de weight 1, sem precisar duplicar o cadastro.
 */
function buildWeightedPool(items) {
  const pool = [];
  for (const item of items) {
    const times = Math.max(1, Math.min(10, item.weight ?? 1));
    for (let i = 0; i < times; i++) pool.push(item);
  }
  return pool;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sorteia `count` itens em rodizio equilibrado: percorre o pool inteiro
 * (embaralhado) antes de repetir qualquer item. Isso evita o problema de
 * um sorteio puramente aleatorio, onde a mesma legenda pode sair 4x
 * seguidas enquanto outra nunca aparece.
 */
export function rotate(items, count) {
  if (items.length === 0 || count <= 0) return [];

  const pool = buildWeightedPool(items);
  const picked = [];
  let cycle = shuffle(pool);

  for (let i = 0; i < count; i++) {
    if (cycle.length === 0) cycle = shuffle(pool);
    picked.push(cycle.pop());
  }

  return picked;
}

/**
 * Monta a legenda final de um video juntando texto e hashtags.
 * As hashtags vao em bloco separado por uma linha em branco — formato que
 * o Instagram renderiza melhor que hashtags coladas no fim do paragrafo.
 */
export function composeCaption(text, hashtags) {
  const body = String(text || '').trim();
  const tags = (hashtags || []).slice(0, MAX_HASHTAGS).join(' ');

  if (body && tags) return `${body}\n\n${tags}`;
  return body || tags;
}

/**
 * Aplica legendas e/ou hashtags em lote aos videos da fila.
 *
 * Nao toca em nada fora de `Video.caption` — o fluxo de publicacao, o
 * agendamento e os arquivos permanecem exatamente como estavam. Videos ja
 * publicados ou com falha nunca sao alterados.
 *
 * @param {object}  opts
 * @param {boolean} opts.overwrite      sobrescreve legendas ja preenchidas
 * @param {boolean} opts.useCaptions    usa a biblioteca de legendas
 * @param {boolean} opts.useHashtags    anexa hashtags
 * @param {string}  opts.hashtagGroupId grupo fixo; vazio = rodizio entre todos
 * @param {boolean} opts.dryRun         so simula, sem gravar
 */
export async function applyLibraryToQueue(opts = {}) {
  const {
    overwrite = false,
    useCaptions = true,
    useHashtags = true,
    hashtagGroupId = null,
    dryRun = false,
  } = opts;

  if (!useCaptions && !useHashtags) {
    throw new Error('Selecione ao menos legendas ou hashtags para aplicar.');
  }

  // Somente videos que ainda vao ao ar. PUBLISHED/FAILED ficam intocados.
  const videos = await prisma.video.findMany({
    where: { status: { in: ['PENDING', 'SCHEDULED'] } },
    orderBy: { position: 'asc' },
  });

  const targets = overwrite
    ? videos
    : videos.filter((v) => !v.caption || !v.caption.trim());

  if (targets.length === 0) {
    return { updated: 0, skipped: videos.length, preview: [], captionsUsed: 0, groupsUsed: 0 };
  }

  const captions = useCaptions
    ? await prisma.captionTemplate.findMany({ where: { enabled: true }, orderBy: { usedCount: 'asc' } })
    : [];

  let groups = [];
  if (useHashtags) {
    groups = hashtagGroupId
      ? await prisma.hashtagGroup.findMany({ where: { id: hashtagGroupId } })
      : await prisma.hashtagGroup.findMany({ where: { enabled: true }, orderBy: { usedCount: 'asc' } });
  }

  if (useCaptions && captions.length === 0) {
    throw new Error('Nenhuma legenda ativa cadastrada na biblioteca.');
  }
  if (useHashtags && groups.length === 0) {
    throw new Error('Nenhum grupo de hashtags ativo cadastrado na biblioteca.');
  }

  const pickedCaptions = rotate(captions, targets.length);
  const pickedGroups = rotate(groups, targets.length);

  const preview = [];
  const captionHits = new Map();
  const groupHits = new Map();

  for (let i = 0; i < targets.length; i++) {
    const video = targets[i];
    const caption = pickedCaptions[i];
    const group = pickedGroups[i];

    const text = caption ? caption.text : (overwrite ? '' : video.caption || '');
    const tags = group ? normalizeHashtags(group.hashtags) : [];
    const finalCaption = composeCaption(text, tags);

    if (caption) captionHits.set(caption.id, (captionHits.get(caption.id) || 0) + 1);
    if (group) groupHits.set(group.id, (groupHits.get(group.id) || 0) + 1);

    if (!dryRun) {
      await prisma.video.update({ where: { id: video.id }, data: { caption: finalCaption } });
    }

    if (preview.length < 5) {
      preview.push({ filename: video.filename, caption: finalCaption });
    }
  }

  if (!dryRun) {
    // Contadores de uso alimentam o rodizio da proxima execucao (os menos
    // usados vem primeiro no `orderBy` la em cima).
    for (const [id, hits] of captionHits) {
      await prisma.captionTemplate.update({ where: { id }, data: { usedCount: { increment: hits } } });
    }
    for (const [id, hits] of groupHits) {
      await prisma.hashtagGroup.update({ where: { id }, data: { usedCount: { increment: hits } } });
    }

    await logEvent({
      action: 'BIBLIOTECA_APLICADA',
      status: 'SUCCESS',
      message: `Legendas/hashtags aplicadas a ${targets.length} video(s) da fila.`,
    });
  }

  return {
    updated: targets.length,
    skipped: videos.length - targets.length,
    captionsUsed: captionHits.size,
    groupsUsed: groupHits.size,
    preview,
  };
}

/**
 * Monta UMA legenda pronta a partir da biblioteca, para uso no momento em
 * que um video entra na fila (importacao automatica de pasta monitorada).
 *
 * Reaproveita o mesmo rodizio ponderado da aplicacao em lote — quem importa
 * 200 videos ao longo da semana recebe a mesma distribuicao equilibrada de
 * quem aplicou tudo de uma vez. Devolve null quando a biblioteca esta vazia,
 * deixando o chamador seguir com a legenda padrao das configuracoes.
 */
export async function pickCaptionForNewVideo() {
  const [captions, groups] = await Promise.all([
    prisma.captionTemplate.findMany({ where: { enabled: true }, orderBy: { usedCount: 'asc' } }),
    prisma.hashtagGroup.findMany({ where: { enabled: true }, orderBy: { usedCount: 'asc' } }),
  ]);

  if (captions.length === 0 && groups.length === 0) return null;

  const [caption] = rotate(captions, 1);
  const [group] = rotate(groups, 1);

  if (caption) {
    await prisma.captionTemplate.update({
      where: { id: caption.id },
      data: { usedCount: { increment: 1 } },
    });
  }
  if (group) {
    await prisma.hashtagGroup.update({
      where: { id: group.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  return composeCaption(caption?.text || '', group ? normalizeHashtags(group.hashtags) : []);
}
