import { chromium } from 'playwright';
import { getSessionFile, sessionExists } from '../services/instagramAuth.js';
import { sessionExistsFor, sessionFileFor } from '../services/accountManager.js';

const HEADLESS = process.env.HEADLESS === 'true';

let browserInstance = null;

// Um BrowserContext por conta. Contextos separados nunca compartilham
// cookies, entao duas contas jamais se misturam — mesmo que o agendador
// alterne entre elas na mesma execucao do navegador.
const contexts = new Map(); // accountId -> BrowserContext

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: HEADLESS });
  }
  return browserInstance;
}

/**
 * Contexto ja carregado com a sessao salva da conta.
 *
 * Sem `accountId` responde pela sessao legada (app de conta unica), mantendo
 * qualquer chamador antigo funcionando sem alteracao.
 */
export async function getBrowserContext(accountId) {
  if (!accountId) {
    if (!sessionExists()) {
      throw new Error('Nenhuma sessão do Instagram encontrada. Conecte-se na página "Instagram" primeiro.');
    }
    return getContextFor('__legacy__', getSessionFile());
  }

  if (!sessionExistsFor(accountId)) {
    throw new Error('Essa conta não está conectada. Conecte-a na página "Contas do Instagram".');
  }
  return getContextFor(accountId, sessionFileFor(accountId));
}

async function getContextFor(key, storageStatePath) {
  const cached = contexts.get(key);
  if (cached) return cached;

  const browser = await getBrowser();
  const context = await browser.newContext({ storageState: storageStatePath });
  contexts.set(key, context);
  return context;
}

/**
 * Persiste a sessao mais recente de uma conta e fecha so o contexto dela.
 * O navegador segue vivo para as outras contas.
 */
export async function closeAccountContext(accountId) {
  const key = accountId || '__legacy__';
  const context = contexts.get(key);
  if (!context) return;

  const target = accountId ? sessionFileFor(accountId) : getSessionFile();
  try {
    await context.storageState({ path: target });
  } catch {
    /* sessão pode já estar inválida, ignora */
  }
  await context.close().catch(() => {});
  contexts.delete(key);
}

/**
 * Fecha o navegador liberando recursos e persistindo a sessão mais recente
 * em disco. Chamado ao pausar/parar a automação (a menos que
 * keepBrowserOpen esteja ativo) ou ao encerrar o servidor.
 */
export async function closeBrowser() {
  for (const key of [...contexts.keys()]) {
    await closeAccountContext(key === '__legacy__' ? null : key);
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
