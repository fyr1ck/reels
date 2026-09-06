import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';

const SESSION_DIR = process.env.SESSION_DIR || './playwright/session';

// Sessao do tempo em que o app era de conta unica. Continua sendo respeitada:
// na primeira execucao apos o multi-conta ela e adotada pela conta padrao, em
// vez de obrigar o usuario a logar de novo.
const LEGACY_SESSION_FILE = path.join(SESSION_DIR, 'storageState.json');

/**
 * Pasta de sessao de uma conta. Cada conta tem cookies/storageState proprios,
 * para o Playwright nunca misturar logins.
 *
 * Isolamento aqui e apenas de sessao — nao ha mascaramento de fingerprint nem
 * navegador anti-deteccao. Rodar muitas contas segue sendo risco de bloqueio.
 */
export function sessionDirFor(accountId) {
  return path.join(SESSION_DIR, accountId);
}

export function sessionFileFor(accountId) {
  return path.join(sessionDirFor(accountId), 'storageState.json');
}

export function sessionExistsFor(accountId) {
  return fs.existsSync(sessionFileFor(accountId));
}

export function deleteSessionFor(accountId) {
  const file = sessionFileFor(accountId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * Garante que existe ao menos uma conta e que ela e a padrao.
 * Roda no boot: um banco novo (sem a migracao de dados) tambem fica utilizavel.
 */
export async function ensureDefaultAccount() {
  const existing = await prisma.account.findFirst({ where: { isDefault: true } });
  if (existing) return existing;

  const any = await prisma.account.findFirst({ orderBy: { position: 'asc' } });
  if (any) {
    return prisma.account.update({ where: { id: any.id }, data: { isDefault: true } });
  }

  return prisma.account.create({
    data: { username: 'conta-principal', label: 'Conta principal', isDefault: true },
  });
}

/**
 * Move a sessao antiga (conta unica) para a pasta da conta padrao.
 * Copia antes de remover: se algo falhar no meio, o login antigo sobrevive.
 */
export async function adoptLegacySession() {
  if (!fs.existsSync(LEGACY_SESSION_FILE)) return null;

  const account = await ensureDefaultAccount();
  const target = sessionFileFor(account.id);
  if (fs.existsSync(target)) return null; // a conta padrao ja tem sessao propria

  fs.mkdirSync(sessionDirFor(account.id), { recursive: true });
  fs.copyFileSync(LEGACY_SESSION_FILE, target);
  fs.unlinkSync(LEGACY_SESSION_FILE);

  await prisma.account.update({
    where: { id: account.id },
    data: { connected: true, lastConnectedAt: new Date() },
  });

  return account;
}

/**
 * Sincroniza a flag `connected` com a realidade do disco.
 * Sem isso, apagar a pasta de sessao por fora deixaria o painel mentindo.
 */
export async function refreshConnectionFlags() {
  const accounts = await prisma.account.findMany();
  for (const account of accounts) {
    const onDisk = sessionExistsFor(account.id);
    if (onDisk !== account.connected) {
      await prisma.account.update({ where: { id: account.id }, data: { connected: onDisk } });
    }
  }
}

/**
 * Conta usada pelas telas que ainda nao selecionam conta explicitamente.
 * Aceita um id vindo do header/query; cai na conta padrao quando ausente
 * ou invalido — assim nenhuma rota antiga quebra.
 */
export async function resolveAccount(accountId) {
  if (accountId) {
    const found = await prisma.account.findUnique({ where: { id: accountId } });
    if (found) return found;
  }
  return ensureDefaultAccount();
}

/**
 * Contas que o agendador deve processar: ativas, conectadas e com automacao
 * ligada. Uma conta desconectada nunca entra no loop — publicar sem sessao
 * so geraria falha e pausaria a automacao.
 */
export async function getRunnableAccounts() {
  const accounts = await prisma.account.findMany({
    where: { active: true, automationStatus: 'ACTIVE' },
    orderBy: { position: 'asc' },
  });
  return accounts.filter((a) => sessionExistsFor(a.id));
}
