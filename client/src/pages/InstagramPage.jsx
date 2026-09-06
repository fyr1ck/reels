import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function InstagramPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  async function load() {
    const res = await api.get('/instagram/status');
    setConnected(res.data.connected);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function connect() {
    setConnecting(true);
    try {
      await api.post('/instagram/connect');
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao conectar. Verifique se você concluiu o login na janela do navegador.');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar a sessão do Instagram? Será necessário fazer login manualmente novamente.')) return;
    await api.post('/instagram/disconnect');
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Instagram</h1>
        <p>Conecte sua conta manualmente. O app nunca lê, solicita ou armazena sua senha.</p>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <h3 className="section-title">🔐 Status da sessão</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span className={`dot ${connected ? 'dot-success' : 'dot-danger'}`} />
          <b>{loading ? 'Verificando...' : connected ? 'Instagram conectado' : 'Instagram desconectado'}</b>
        </div>

        {!connected && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13, color: 'var(--text-dim)' }}>
            Ao clicar em "Conectar Instagram", uma janela real do navegador será aberta.
            Faça login normalmente (incluindo qualquer verificação de segurança, como 2FA)
            diretamente na janela. Assim que o login for concluído, a sessão é salva
            localmente e reutilizada nas próximas publicações — você não precisará logar
            novamente.
          </div>
        )}

        <div className="btn-row">
          {!connected ? (
            <button className="btn btn-primary" onClick={connect} disabled={connecting}>
              {connecting ? '⏳ Aguardando login na janela do navegador...' : '📷 Conectar Instagram'}
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={connect} disabled={connecting}>
                🔄 Reconectar / novo login
              </button>
              <button className="btn btn-danger" onClick={disconnect}>Desconectar</button>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620, marginTop: 16 }}>
        <h3 className="section-title">🛡️ Segurança</h3>
        <ul style={{ fontSize: 13, color: 'var(--text-dim)', paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
          <li>Sua senha nunca é digitada, capturada ou armazenada pelo aplicativo.</li>
          <li>A sessão fica salva apenas no seu computador (playwright/session).</li>
          <li>Se o Instagram solicitar CAPTCHA, código de segurança ou 2FA durante uma publicação, a automação pausa automaticamente e pede sua intervenção manual no Dashboard.</li>
        </ul>
      </div>
    </div>
  );
}
