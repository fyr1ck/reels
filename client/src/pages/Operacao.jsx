import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { api, formatDateTime } from '../api/client.js';

const HEALTH_BADGE = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  neutral: 'badge-neutral',
};

export default function Operacao() {
  const [data, setData] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [{ data: op }, { data: next }] = await Promise.all([
        api.get('/operation'),
        api.get('/operation/upcoming'),
      ]);
      setData(op);
      setUpcoming(next);
    } catch {
      // silencioso — a tela mostra o estado vazio
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="card">Carregando operação…</div>;
  if (!data) return <div className="card">Não foi possível carregar o panorama.</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Operação</h2>
          <p className="text-dim">
            Quanto conteúdo existe, a que ritmo ele sai e por quantos dias a fila aguenta.
          </p>
        </div>
        <button className="btn btn-sm" onClick={load}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="op-hero card">
        <div className="op-hero-main">
          <div className="op-hero-label">Cobertura da fila</div>
          <div className="op-hero-value">
            {data.daysCoverage == null ? '—' : formatDays(data.daysCoverage)}
          </div>
          <div className="text-dim">{describeCoverage(data)}</div>
        </div>
        <span className={`badge ${HEALTH_BADGE[data.health.level]} op-hero-badge`}>
          {data.health.label}
        </span>
      </div>

      <CoverageBar days={data.daysCoverage} />

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="stat-card">
          <div className="label">Disponíveis na fila</div>
          <div className="value">{data.availableVideos}</div>
          <div className="text-faint">{data.pending} pendentes · {data.scheduled} agendados</div>
        </div>
        <div className="stat-card">
          <div className="label">Ritmo diário</div>
          <div className="value">{data.dailyRate}</div>
          <div className="text-faint">
            {data.scheduleMode === 'INTERVAL'
              ? `a cada ${data.intervalMinutes} min`
              : `${data.slotsPerDay} horário(s) por dia`}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Publicados</div>
          <div className="value">{data.published}</div>
          <div className="text-faint">
            {data.lastPublishedAt ? `último: ${formatDateTime(data.lastPublishedAt)}` : 'nenhum ainda'}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Sem legenda</div>
          <div className="value">{data.withoutCaption}</div>
          <div className="text-faint">na fila, aguardando texto</div>
        </div>
      </div>

      {data.withoutCaption > 0 && (
        <div className="banner banner-warning" style={{ marginTop: 16 }}>
          <AlertTriangle size={16} />
          <span>
            {data.withoutCaption} vídeo(s) sem legenda vão ao ar com a legenda padrão (ou nenhuma).
            Preencha em <b>Legendas &amp; Hashtags → Aplicar na fila</b>.
          </span>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-title">🗓️ Próximas publicações</h3>
        {upcoming.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🗓️</div>
            Nada agendado. Adicione vídeos à fila e cadastre horários.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Quando</th><th>Vídeo</th><th>Legenda</th></tr>
            </thead>
            <tbody>
              {upcoming.map((u) => (
                <tr key={u.id}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDateTime(u.scheduledAt)}</td>
                  <td className="text-dim">{u.filename}</td>
                  <td>
                    <span className={`badge ${u.hasCaption ? 'badge-success' : 'badge-warning'}`}>
                      {u.hasCaption ? 'ok' : 'vazia'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/**
 * Barra de cobertura com faixas de leitura rápida: até 3 dias é aperto,
 * até 7 dá pra respirar, acima disso está confortável.
 */
function CoverageBar({ days }) {
  if (days == null) return null;

  const target = 14; // referência visual: duas semanas de fôlego
  const pct = Math.min(100, (days / target) * 100);
  const level = days < 3 ? 'danger' : days < 7 ? 'warning' : 'success';

  return (
    <div className="op-bar-wrap card">
      <div className="op-bar-head">
        <span className="text-faint">0</span>
        <span className="text-faint">meta: {target} dias</span>
      </div>
      <div className="op-bar">
        <div className={`op-bar-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatDays(days) {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function describeCoverage(data) {
  if (data.dailyRate === 0) {
    return 'Nenhum horário configurado — sem ritmo definido, não dá para estimar a cobertura.';
  }
  if (data.availableVideos === 0) {
    return 'A fila está vazia. Adicione vídeos para a automação ter o que publicar.';
  }
  const rate = data.scheduleMode === 'INTERVAL'
    ? `a cada ${data.intervalMinutes} min`
    : `${data.dailyRate} por dia`;
  return `${data.availableVideos} vídeo(s) na fila publicando ${rate}.`;
}
