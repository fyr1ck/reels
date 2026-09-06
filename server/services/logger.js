import { prisma } from '../db/prisma.js';

/**
 * Registra um evento no banco (tabela Log) e no console.
 * Nunca lança erro para não derrubar o fluxo principal por falha de log.
 */
export async function logEvent({ video = null, action, status = 'INFO', message = null, attempt = null, durationMs = null }) {
  const ts = new Date().toLocaleString('pt-BR');
  const prefix = `[${ts}] [${status}]`;
  const line = `${prefix} ${action}${video ? ' - ' + video : ''}${message ? ' :: ' + message : ''}`;

  if (status === 'ERROR') console.error(line);
  else if (status === 'WARNING') console.warn(line);
  else console.log(line);

  try {
    await prisma.log.create({ data: { video, action, status, message, attempt, durationMs } });
  } catch (err) {
    console.error('Falha ao gravar log no banco de dados:', err.message);
  }
}
