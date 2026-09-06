import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

const INTERVAL_PRESETS = [1, 2, 5, 10, 15, 30, 60];

/**
 * Descreve a janela de publicação de um slot para o usuário conferir de
 * relance: "14:00 exato" ou "entre 13:50 e 14:10".
 */
function describeJitter(time, jitterMinutes) {
  const minutes = Number(jitterMinutes) || 0;
  if (minutes <= 0) return `${time} exato`;

  const [h, m] = time.split(':').map(Number);
  const base = h * 60 + m;
  const fmt = (total) => {
    const norm = ((total % 1440) + 1440) % 1440;
    return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
  };
  return `entre ${fmt(base - minutes)} e ${fmt(base + minutes)}`;
}


export default function SchedulePage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [newTime, setNewTime] = useState('12:00');
  const [error, setError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function load() {
    const [s1, s2] = await Promise.all([api.get('/schedule'), api.get('/settings')]);
    setSchedules(s1.data);
    setSettings(s2.data);
  }

  useEffect(() => { load(); }, []);

  async function addTime() {
    setError('');
    try {
      await api.post('/schedule', { time: newTime });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao adicionar horário.');
    }
  }

  async function removeTime(id) {
    await api.delete(`/schedule/${id}`);
    await load();
  }

  async function toggleTime(id, enabled) {
    await api.put(`/schedule/${id}`, { enabled });
    await load();
  }

  // Variação aleatória do horário. 0 = publica cravado no minuto (padrão).
  async function saveJitter(id, jitterMinutes) {
    setError('');
    try {
      await api.put(`/schedule/${id}`, { jitterMinutes });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar a variação.');
    }
  }

  async function savePostsPerDay(value) {
    setSavingSettings(true);
    try {
      await api.put('/settings', { ...settings, postsPerDay: value });
      setSettings((s) => ({ ...s, postsPerDay: value }));
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleAutomationDefault(enabled) {
    setSavingSettings(true);
    try {
      const res = await api.put('/settings', { ...settings, automationEnabled: enabled });
      setSettings(res.data);
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveScheduleMode() {
    setSavingSchedule(true);
    try {
      const res = await api.put('/settings', settings);
      setSettings(res.data);
      toast.success('Agendamento salvo com sucesso.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar agendamento.');
    } finally {
      setSavingSchedule(false);
    }
  }

  if (!settings) return <div className="text-dim">Carregando...</div>;

  const isInterval = settings.scheduleMode === 'INTERVAL';

  return (
    <div>
      <div className="page-header">
        <h1>Horários</h1>
        <p>Defina quantas publicações deseja fazer por dia e em quais horários exatos.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title">🔁 Modo de agendamento</h3>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 8, cursor: 'pointer', background: !isInterval ? 'var(--accent-soft)' : 'transparent', borderColor: !isInterval ? 'var(--accent)' : 'var(--border)' }}>
          <input
            type="radio"
            name="schedule-mode"
            checked={!isInterval}
            onChange={() => setSettings((s) => ({ ...s, scheduleMode: 'TIMES' }))}
            style={{ marginTop: 2, width: 'auto' }}
          />
          <span>Horários específicos <span className="text-faint">(ex: 12:00, 14:00, 18:00)</span></span>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', marginBottom: 8, cursor: 'pointer', background: isInterval ? 'var(--accent-soft)' : 'transparent', borderColor: isInterval ? 'var(--accent)' : 'var(--border)' }}>
          <input
            type="radio"
            name="schedule-mode"
            checked={isInterval}
            onChange={() => setSettings((s) => ({ ...s, scheduleMode: 'INTERVAL' }))}
            style={{ marginTop: 2, width: 'auto' }}
          />
          <span>A cada X minutos <span className="text-faint">(ex: publicar a cada 10, 15 ou 60 minutos)</span></span>
        </label>

        {isInterval && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
            <label className="field-label">Intervalo entre publicações</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                type="number"
                min={1}
                style={{ width: 90 }}
                value={settings.intervalMinutes}
                onChange={(e) => setSettings((s) => ({ ...s, intervalMinutes: Math.max(1, +e.target.value || 1) }))}
              />
              <span>minutos</span>
            </div>
            <div className="btn-row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
              {INTERVAL_PRESETS.map((min) => (
                <button
                  key={min}
                  className={`btn btn-sm${settings.intervalMinutes === min ? ' btn-primary' : ''}`}
                  onClick={() => setSettings((s) => ({ ...s, intervalMinutes: min }))}
                >
                  {min} min
                </button>
              ))}
            </div>

            <label className="field-label">Início</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="interval-start"
                  checked={settings.intervalStartMode !== 'AT'}
                  onChange={() => setSettings((s) => ({ ...s, intervalStartMode: 'NOW' }))}
                  style={{ width: 'auto' }}
                />
                Iniciar agora
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="interval-start"
                  checked={settings.intervalStartMode === 'AT'}
                  onChange={() => setSettings((s) => ({ ...s, intervalStartMode: 'AT' }))}
                  style={{ width: 'auto' }}
                />
                Começar em
                <input
                  type="time"
                  disabled={settings.intervalStartMode !== 'AT'}
                  value={settings.intervalStartAt || '18:00'}
                  onChange={(e) => setSettings((s) => ({ ...s, intervalStartAt: e.target.value }))}
                  style={{ width: 120 }}
                />
              </label>
            </div>
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={saveScheduleMode} disabled={savingSchedule}>
            {savingSchedule ? 'Salvando...' : '💾 Salvar agendamento'}
          </button>
        </div>
        <p className="text-faint" style={{ fontSize: 12, marginTop: 8 }}>
          {isInterval
            ? 'Os vídeos pendentes da fila serão distribuídos automaticamente, um a cada intervalo configurado, na ordem em que aparecem na fila.'
            : 'Cadastre os horários exatos abaixo. Todo dia, cada horário ativo recebe o próximo vídeo pendente da fila.'}
        </p>
      </div>

      {!isInterval && (
        <div className="grid grid-2">
          <div className="card">
            <h3 className="section-title">📌 Publicações por dia</h3>
            <label className="field-label">Quantidade desejada (referência informativa)</label>
            <input
              type="text"
              inputMode="numeric"
              value={settings.postsPerDay}
              onChange={(e) => setSettings((s) => ({ ...s, postsPerDay: Number(e.target.value) || 0 }))}
              onBlur={(e) => savePostsPerDay(Number(e.target.value) || 0)}
              style={{ maxWidth: 120 }}
            />
            <p className="text-faint" style={{ fontSize: 12, marginTop: 8 }}>
              O número real de publicações por dia é definido pela quantidade de horários abaixo com status "ativo".
            </p>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.automationEnabled}
                  onChange={(e) => toggleAutomationDefault(e.target.checked)}
                  disabled={savingSettings}
                />
                Publicar automaticamente (ligar/desligar automação)
              </label>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">⏰ Adicionar horário</h3>
            <label className="field-label">Novo horário</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ maxWidth: 140 }} />
              <button className="btn btn-primary" onClick={addTime}>+ Adicionar</button>
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>{error}</p>}
          </div>
        </div>
      )}

      {!isInterval && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="section-title">📋 Horários cadastrados ({schedules.filter((s) => s.enabled).length} ativos)</h3>
          {schedules.length === 0 ? (
            <div className="empty-state">
              <div className="icon">⏰</div>
              Nenhum horário cadastrado ainda.
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Horário</th><th>Variação</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.time}</td>
                    <td>
                      <div className="jitter-cell">
                        <input
                          type="number"
                          min="0"
                          max="120"
                          value={s.jitterMinutes ?? 0}
                          onChange={(e) => saveJitter(s.id, Number(e.target.value))}
                          title="Variação aleatória em minutos (0 = horário exato)"
                        />
                        <span className="text-faint">min</span>
                      </div>
                      <div className="jitter-hint">{describeJitter(s.time, s.jitterMinutes)}</div>
                    </td>
                    <td>
                      <span className={`badge ${s.enabled ? 'badge-success' : 'badge-neutral'}`}>
                        {s.enabled ? 'Ativo' : 'Desativado'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => toggleTime(s.id, !s.enabled)}>
                          {s.enabled ? 'Desativar' : 'Ativar'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => removeTime(s.id)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {isInterval && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="section-title">📌 Publicações por dia</h3>
          <div style={{ marginTop: 8 }}>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.automationEnabled}
                onChange={(e) => toggleAutomationDefault(e.target.checked)}
                disabled={savingSettings}
              />
              Publicar automaticamente (ligar/desligar automação)
            </label>
          </div>
          <p className="text-faint" style={{ fontSize: 12, marginTop: 10 }}>
            No modo "A cada X minutos", os horários exatos são calculados automaticamente pela fila —
            acompanhe a "Próxima publicação" no Dashboard ou os horários gerados no Calendário.
          </p>
        </div>
      )}
    </div>
  );
}
