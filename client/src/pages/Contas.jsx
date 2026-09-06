import { useState } from 'react';
import {
  UserPlus, Trash2, Power, Plug, Unplug, Play, Pause, Shuffle, Star, Film, Camera,
} from 'lucide-react';
import { api, formatDateTime } from '../api/client.js';
import { useAccounts } from '../context/AccountContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const HEALTH_BADGE = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
};

export default function Contas() {
  const { accounts, loading, reload, selectAccount } = useAccounts();
  const toast = useToast();
  const confirmAction = useConfirm();

  const [form, setForm] = useState({ username: '', label: '' });
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function addAccount(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/accounts', form);
      setForm({ username: '', label: '' });
      await reload();
      selectAccount(data.id);
      toast.success(`@${data.username} cadastrada. Agora conecte ao Instagram.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar a conta.');
    }
  }

  async function patch(account, data, successMsg) {
    setBusyId(account.id);
    try {
      await api.put(`/accounts/${account.id}`, data);
      await reload();
      if (successMsg) toast.success(successMsg);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar a conta.');
    } finally {
      setBusyId(null);
    }
  }

  async function connect(account) {
    const ok = await confirmAction({
      title: `Conectar @${account.username}`,
      description:
        'Uma janela real do Chromium vai abrir. Faça o login você mesmo, incluindo 2FA ou verificação, até ver o feed normal. O app nunca vê nem guarda sua senha — só a sessão do navegador.',
      confirmLabel: 'Abrir navegador',
    });
    if (!ok) return;

    setBusyId(account.id);
    toast.info('Abrindo o navegador. Conclua o login na janela que apareceu.');
    try {
      await api.post(`/accounts/${account.id}/connect`);
      await reload();
      toast.success(`@${account.username} conectada.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível confirmar o login.');
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(account) {
    const ok = await confirmAction({
      title: `Desconectar @${account.username}`,
      description: 'A sessão salva é apagada e a automação dessa conta é pausada. Os vídeos da fila continuam onde estão.',
      confirmLabel: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    await api.post(`/accounts/${account.id}/disconnect`);
    await reload();
    toast.success('Conta desconectada.');
  }

  async function makeDefault(account) {
    await api.post(`/accounts/${account.id}/default`);
    await reload();
    toast.success(`@${account.username} agora é a conta padrão.`);
  }

  async function removeAccount(account) {
    const ok = await confirmAction({
      title: `Remover @${account.username}`,
      description:
        'A conta e a sessão dela são apagadas. Os vídeos NÃO são excluídos — ficam sem dono na fila e podem ser reatribuídos.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/accounts/${account.id}`);
      await reload();
      toast.success('Conta removida.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover.');
    }
  }

  if (loading) return <div className="card">Carregando contas…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Contas do Instagram</h2>
          <p className="text-dim">
            Cada conta tem sessão, fila e horários próprios. O isolamento é só de sessão — o app
            não mascara fingerprint nem usa navegador anti-detecção.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title">➕ Nova conta</h3>
        <form onSubmit={addAccount}>
          <div className="acc-form-row">
            <input
              placeholder="@usuario"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <input
              placeholder="Apelido (opcional)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <button className="btn btn-primary" type="submit">
              <UserPlus size={15} /> Cadastrar
            </button>
          </div>
          {error && <div className="banner banner-danger" style={{ marginTop: 12 }}>{error}</div>}
        </form>
      </div>

      <h3 className="section-title" style={{ marginTop: 22 }}>
        🎛️ Operação por conta ({accounts.length})
      </h3>

      <div className="acc-grid">
        {accounts.map((a) => (
          <div key={a.id} className={`acc-card${a.active ? '' : ' inactive'}`}>
            <div className="acc-card-head">
              <div className="acc-avatar">{a.username.slice(0, 2).toUpperCase()}</div>
              <div className="acc-identity">
                <b>@{a.username}</b>
                <span className="text-faint">{a.label || 'sem apelido'}</span>
              </div>
              <span className={`badge ${HEALTH_BADGE[a.health.level]}`}>{a.health.label}</span>
            </div>

            <div className="acc-metrics">
              <div><b>{a.reels}</b> reels</div>
              <div><b>{a.stories}</b> stories</div>
              <div>
                <b>{a.daysCoverage == null ? '—' : a.daysCoverage}</b> dias cobertura
              </div>
              <div className="text-faint">{a.published} publicados</div>
            </div>

            <div className="acc-bar">
              <div
                className={`acc-bar-fill ${coverageLevel(a.daysCoverage)}`}
                style={{ width: `${Math.min(100, ((a.daysCoverage || 0) / 14) * 100)}%` }}
              />
            </div>

            <div className="acc-next">
              Próx.: {a.nextPublicationAt
                ? `${formatDateTime(a.nextPublicationAt)} · ${a.nextPublicationName}`
                : '—'}
              <br />
              <span className="text-faint">
                {a.slotsPerDay} horário(s)/dia
                {a.connected && a.lastConnectedAt
                  ? ` · conectada em ${formatDateTime(a.lastConnectedAt)}`
                  : ''}
              </span>
            </div>

            <label className="checkbox-row acc-toggle">
              <input
                type="checkbox"
                checked={a.randomOrder}
                disabled={busyId === a.id}
                onChange={(e) => patch(a, { randomOrder: e.target.checked })}
              />
              <Shuffle size={13} /> Ordem aleatória
            </label>

            <div className="btn-row acc-actions">
              {a.connected ? (
                <button className="btn btn-sm" onClick={() => disconnect(a)} disabled={busyId === a.id}>
                  <Unplug size={13} /> Desconectar
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => connect(a)} disabled={busyId === a.id}>
                  <Plug size={13} /> {busyId === a.id ? 'Aguardando…' : 'Conectar'}
                </button>
              )}

              {a.automationStatus === 'ACTIVE' ? (
                <button
                  className="btn btn-sm"
                  onClick={() => patch(a, { automationStatus: 'PAUSED' }, 'Automação pausada.')}
                  disabled={busyId === a.id}
                >
                  <Pause size={13} /> Pausar
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-success"
                  onClick={() => patch(a, { automationStatus: 'ACTIVE' }, 'Automação ativada.')}
                  disabled={busyId === a.id}
                >
                  <Play size={13} /> Ativar
                </button>
              )}

              <button className="btn btn-sm" onClick={() => patch(a, { active: !a.active })} disabled={busyId === a.id}>
                <Power size={13} /> {a.active ? 'Ativa' : 'Inativa'}
              </button>

              {!a.isDefault && (
                <>
                  <button className="btn btn-sm" onClick={() => makeDefault(a)} title="Tornar conta padrão">
                    <Star size={13} />
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeAccount(a)}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              {a.isDefault && <span className="badge badge-accent">padrão</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 className="section-title">ℹ️ Como funciona</h3>
        <ul className="acc-help">
          <li><Plug size={13} /> <b>Conectar</b> abre o Chromium para você fazer login. A senha nunca passa pelo app.</li>
          <li><Play size={13} /> <b>Ativar</b> só é permitido depois de conectar — ativar sem sessão apenas geraria falha.</li>
          <li><Film size={13} /> <b>Reels</b> e <Camera size={13} /> <b>stories</b> têm grades de horário independentes, em <b>Horários</b>.</li>
          <li><Shuffle size={13} /> <b>Ordem aleatória</b> sorteia o próximo vídeo em vez de seguir a posição da fila.</li>
        </ul>
      </div>
    </>
  );
}

function coverageLevel(days) {
  if (days == null) return 'neutral';
  if (days < 3) return 'danger';
  if (days < 7) return 'warning';
  return 'success';
}
