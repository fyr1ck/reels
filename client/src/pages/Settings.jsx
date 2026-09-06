import { useEffect, useState } from 'react';
import { Monitor, Save, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Configurações ficou com o que é de fato preferência global do app.
 *
 * O que morava aqui e saiu, cada um para onde é usado:
 *   - Legenda padrão  -> Legendas & Hashtags (aba "Legenda padrão")
 *   - Capa padrão     -> Fila de vídeos (barra acima da lista)
 *   - Armazenamento   -> Armazenamento (tela própria)
 *   - Zona de risco   -> Armazenamento (tela própria)
 *
 * Com o multi-conta, legenda e agendamento passaram a ser por conta, então um
 * balcão único de configurações deixou de fazer sentido.
 */
export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings').then((res) => setSettings(res.data)).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put('/settings', {
        keepBrowserOpen: settings.keepBrowserOpen,
        intervalStartMode: settings.intervalStartMode,
        intervalStartAt: settings.intervalStartAt,
      });
      setSettings(data);
      toast.success('Configurações salvas.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="card">Carregando…</div>;

  return (
    <>
      <div className="page-header">
        <h2>Configurações</h2>
        <p className="text-dim">Preferências gerais do aplicativo.</p>
      </div>

      <div className="card">
        <h3 className="section-title"><Monitor size={15} /> Navegador</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.keepBrowserOpen}
            onChange={(e) => setSettings((s) => ({ ...s, keepBrowserOpen: e.target.checked }))}
          />
          Manter a janela do navegador aberta entre publicações
        </label>
        <p className="text-faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          Reaproveitar a janela deixa as publicações seguintes mais rápidas, mas mantém o
          Chromium consumindo memória entre elas. A visibilidade da janela é separada disso e
          fica em <code>HEADLESS</code>, no arquivo <code>.env</code> — vale manter visível
          para você conseguir resolver um CAPTCHA ou 2FA quando o Instagram pedir.
        </p>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-title">🧭 O resto mudou de lugar</h3>
        <p className="text-faint" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
          Cada ajuste passou para a tela onde ele é usado, em vez de ficar num balcão único
          distante do efeito que produz.
        </p>
        <div className="settings-links">
          <Link className="settings-link" to="/biblioteca">
            <b>Legenda padrão</b>
            <span className="text-faint">Legendas &amp; Hashtags</span>
            <ExternalLink size={13} />
          </Link>
          <Link className="settings-link" to="/fila">
            <b>Capa padrão</b>
            <span className="text-faint">Fila de vídeos</span>
            <ExternalLink size={13} />
          </Link>
          <Link className="settings-link" to="/armazenamento">
            <b>Espaço em disco e limpeza</b>
            <span className="text-faint">Armazenamento</span>
            <ExternalLink size={13} />
          </Link>
          <Link className="settings-link" to="/contas">
            <b>Legenda, ritmo e automação por conta</b>
            <span className="text-faint">Contas</span>
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </>
  );
}
