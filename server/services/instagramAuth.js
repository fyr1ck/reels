import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { logEvent } from './logger.js';
import { closeBrowser } from '../playwright/browserManager.js';

const SESSION_DIR = process.env.SESSION_DIR || './playwright/session';
const SESSION_FILE = path.join(SESSION_DIR, 'storageState.json');

export function sessionExists() {
  return fs.existsSync(SESSION_FILE);
}

export function getSessionFile() {
  return SESSION_FILE;
}

/**
 * Abre uma janela de navegador VISÍVEL para o usuário fazer login manual no
 * Instagram. O app nunca lê, captura ou armazena a senha — apenas espera o
 * usuário concluir o login (incluindo qualquer 2FA/CAPTCHA que apareça) e,
 * quando a URL sair da tela de login, salva o storageState (cookies/tokens
 * de sessão) em disco para reutilização nas próximas execuções.
 */
export async function connectInstagram() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });

  // Garante que não há outro browser controlado pela automação de publicação
  // usando a mesma sessão simultaneamente.
  await closeBrowser();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await logEvent({ action: 'LOGIN_MANUAL_INICIADO', status: 'INFO', message: 'Aguardando login manual do usuário no navegador.' });

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

  try {
    // Espera até 5 minutos, verificando a cada segundo se o cookie
    // "sessionid" (o único que realmente autentica no Instagram) já existe.
    // Só a URL sair de /accounts/login NÃO é suficiente: se o Instagram
    // pedir checkpoint/CAPTCHA, ele redireciona para outra URL (ex:
    // /challenge/) antes do login terminar de verdade — o que fazia o app
    // considerar "concluído" e salvar uma sessão incompleta (sem sessionid).
    const deadline = Date.now() + 5 * 60 * 1000;
    let authenticated = false;

    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      if (cookies.some((c) => c.name === 'sessionid')) {
        authenticated = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    if (!authenticated) {
      throw new Error('sessionid não encontrado a tempo.');
    }

    // Pequena espera extra para o Instagram terminar de gravar
    // localStorage/cookies adicionais logo após a autenticação.
    await page.waitForTimeout(3000);
  } catch (e) {
    await browser.close();
    await logEvent({ action: 'LOGIN_MANUAL_TIMEOUT', status: 'ERROR', message: 'Tempo esgotado aguardando login manual ou login não confirmado (sessionid ausente).' });
    throw new Error('Não foi possível confirmar o login. Certifique-se de concluir TODAS as etapas (senha, CAPTCHA, código de verificação) até ver seu feed normal do Instagram, e clique em "Conectar Instagram" novamente.');
  }

  await context.storageState({ path: SESSION_FILE });
  await logEvent({ action: 'LOGIN_MANUAL_CONCLUIDO', status: 'SUCCESS', message: 'Sessão do Instagram salva com sucesso.' });

  await browser.close();
  return true;
}

export function disconnectInstagram() {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE);
  }
}
