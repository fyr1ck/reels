import { useEffect, useState, useCallback } from 'react';
import { Film, CheckCircle2, Package, CalendarClock, Bot, Clock3, AlertTriangle, Sparkles, RotateCcw } from 'lucide-react';
import { api, formatDateTime } from '../api/client.js';
import AutomationBadge from '../components/AutomationBadge.jsx';
import { DashboardSkeleton } from '../components/ui/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();
  const confirmAction = useConfirm();

  const load = useCallback(async () => {
    const [s1, s2] = await Promise.all([api.get('/dashboard/summary'), api.get('/automation/status')]);
    setSummary(s1.data);
    setStatus(s2.data);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function runAction(action) {
    setBusy(true);
    try {
      await api.post(`/automation/${action}`);
      await load();
      if (action === 'start') toast.success('Automação iniciada.');
      if (action === 'pause') toast.info('Automação pausada.');
      if (action === 'stop') toast.warning('Automação parada.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao executar ação.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveIntervention() {
    setBusy(true);
    try {
      await api.post('/automation/resolve-intervention');
      await load();
      toast.success('Intervenção resolvida, automação retomada.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao confirmar intervenção.');
    } finally {
      setBusy(false);
    }
  }

  async function resetDashboard() {
    const ok = await confirmAction({
      title: 'Resetar dashboard?',
      description: 'Isso apaga DEFINITIVAMENTE os registros de vídeos publicados e falhados (banco + arquivo, se existir) e todo o histórico de logs, zerando os números. Vídeos pendentes/agendados e configurações não são afetados. Essa ação não pode ser desfeita.',
      danger: true,
      confirmLabel: 'Resetar',
    });
    if (!ok) return;
    setResetting(true);
    try {
      const { data } = await api.post('/dashboard/reset');
      await load();
      toast.success(`Dashboard resetado (${data.videosRemoved} vídeo(s) e ${data.logsDeleted} log(s) removidos).`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao resetar dashboard.');
    } finally {
      setResetting(false);
    }
  }

  if (!summary || !status) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Visão geral da fila, agendamentos e da automação de publicação.</p>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1>{getGreeting()} 👋</h1>
          <p>Veja o que está acontecendo com suas publicações.</p>
        </div>
        <button className="btn btn-sm" onClick={resetDashboard} disabled={resetting} title="Limpa o histórico de logs/erros exibido no dashboard">
          <RotateCcw size={13} /> {resetting ? 'Resetando...' : 'Resetar dashboard'}
        </button>
      </div>

      {status.interventionPending && (
        <div className="banner banner-warning">
          <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <b>Intervenção necessária no navegador.</b>&nbsp;
            {status.interventionMessage || 'Resolva a verificação de segurança na janela do navegador aberta e clique em continuar.'}
          </p>
          <button className="btn btn-primary btn-sm" onClick={resolveIntervention} disabled={busy}>Já resolvi, continuar</button>
        </div>
      )}

      {summary.failed > 0 && !status.interventionPending && status.automationStatus === 'PAUSED' && (
        <div className="banner banner-danger">
          <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            Há vídeos com falha definitiva de publicação. Revise em <b>&nbsp;Fila de vídeos → Falhados&nbsp;</b> antes de retomar.
          </p>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat-card">
          <span className="stat-label"><Film size={14} /> Vídeos pendentes</span>
          <span className="stat-value">{summary.pending}</span>
          <span className="stat-sub">Aguardando agendamento/publicação</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label"><CheckCircle2 size={14} /> Vídeos publicados</span>
          <span className="stat-value">{summary.published}</span>
          <span className="stat-sub">Total já publicado com sucesso</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label"><Package size={14} /> Total na fila</span>
          <span className="stat-value">{summary.totalQueue}</span>
          <span className="stat-sub">Pendentes + publicados + falhados</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label"><CalendarClock size={14} /> Publicações hoje</span>
          <span className="stat-value">{summary.todayPublished}/{summary.todayPublications}</span>
          <span className="stat-sub">Concluídas / agendadas para hoje</span>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 className="section-title"><Bot size={16} /> Status da automação</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <AutomationBadge status={status.automationStatus} />
            <span className="text-faint" style={{ fontSize: 12 }}>
              {status.automationEnabled ? 'Automação habilitada' : 'Automação desligada'}
            </span>
          </div>
          <div className="btn-row">
            <button className="btn btn-success" disabled={busy || status.automationStatus === 'ACTIVE'} onClick={() => runAction('start')}>Iniciar automação</button>
            <button className="btn" disabled={busy || status.automationStatus !== 'ACTIVE'} onClick={() => runAction('pause')}>Pausar</button>
            <button className="btn btn-danger" disabled={busy || !status.automationEnabled} onClick={() => runAction('stop')}>Parar</button>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
            <span className="stat-label"><Clock3 size={13} /> Próxima publicação</span>
            {status.nextPublication ? (
              <div style={{ marginTop: 6 }}>
                <b>{status.nextPublication.video.filename}</b>
                <div className="text-dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                  agendado para {formatDateTime(status.nextPublication.scheduledAt)}
                </div>
              </div>
            ) : (
              <div className="text-faint" style={{ marginTop: 6, fontSize: 13 }}>Nenhuma publicação agendada.</div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="section-title"><AlertTriangle size={16} /> Últimos erros</h3>
          {summary.recentErrors.length === 0 ? (
            <div className="empty-state">
              <div className="icon-wrap"><Sparkles size={22} /></div>
              Nenhum erro registrado recentemente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summary.recentErrors.map((log) => (
                <div key={log.id} style={{ fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{log.action}</b>
                    <span className="text-faint">{formatDateTime(log.timestamp)}</span>
                  </div>
                  {log.video && <div className="text-dim">{log.video}</div>}
                  {log.message && <div className="text-faint">{log.message}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
