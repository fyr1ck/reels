import { chromium } from 'playwright';
import { getSessionFile, sessionExists } from '../services/instagramAuth.js';

const HEADLESS = process.env.HEADLESS === 'true';

let browserInstance = null;
let contextInstance = null;

/**
 * Retorna um BrowserContext único e reutilizado entre publicações, já
 * carregado com a sessão salva (storageState). Lança erro claro se não
 * houver sessão conectada.
 */
export async function getBrowserContext() {
  if (!sessionExists()) {
    throw new Error('Nenhuma sessão do Instagram encontrada. Conecte-se na página "Instagram" primeiro.');
  }
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: HEADLESS });
  }
  if (!contextInstance) {
    contextInstance = await browserInstance.newContext({ storageState: getSessionFile() });
  }
  return contextInstance;
}

/**
 * Fecha o navegador liberando recursos e persistindo a sessão mais recente
 * em disco. Chamado ao pausar/parar a automação (a menos que
 * keepBrowserOpen esteja ativo) ou ao encerrar o servidor.
 */
export async function closeBrowser() {
  if (contextInstance) {
    try {
      await contextInstance.storageState({ path: getSessionFile() });
    } catch (e) {
      /* sessão pode já estar inválida, ignora */
    }
    await contextInstance.close().catch(() => {});
    contextInstance = null;
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
