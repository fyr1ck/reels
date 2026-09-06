import { useEffect, useState } from 'react';
import { useAccounts } from '../context/AccountContext.jsx';
import { api, formatDate, formatTime } from '../api/client.js';

const STATUS_LABEL = {
  SCHEDULED: { label: 'Agendado', cls: 'badge-accent' },
  PUBLISHING: { label: 'Publicando', cls: 'badge-warning' },
  PUBLISHED: { label: 'Publicado', cls: 'badge-success' },
  FAILED: { label: 'Falhou', cls: 'badge-danger' },
};

export default function CalendarPage() {
  const [publications, setPublications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { selectedId, selected } = useAccounts();

  useEffect(() => {
    setLoading(true);
    api.get('/publications/calendar', { params: { accountId: selectedId || undefined } }).then((res) => {
      setPublications(res.data);
      setLoading(false);
    });
    // Recarrega ao trocar de conta — senão o calendário continuaria mostrando
    // a agenda do perfil anterior.
  }, [selectedId]);

  if (loading) return <div className="text-dim">Carregando...</div>;

  const groups = {};
  for (const pub of publications) {
    const key = formatDate(pub.scheduledAt);
    groups[key] = groups[key] || [];
    groups[key].push(pub);
  }

  const orderedDays = Object.keys(groups).sort((a, b) => {
    const da = groups[a][0].scheduledAt;
    const db = groups[b][0].scheduledAt;
    return new Date(da) - new Date(db);
  });

  return (
    <div>
      <div className="page-header">
        <h1>Calendário</h1>
        <p>Agenda de <b>@{selected?.username || '—'}</b>: horários agendados, publicações concluídas e falhas, por dia.</p>
      </div>

      {orderedDays.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📅</div>
          Nenhuma publicação agendada ainda. Adicione vídeos à fila e configure os horários.
        </div>
      ) : (
        orderedDays.map((day) => (
          <div key={day} className="day-block">
            <h4>📅 {day}</h4>
            {groups[day]
              .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
              .map((pub) => {
                const st = STATUS_LABEL[pub.status] || STATUS_LABEL.SCHEDULED;
                return (
                  <div key={pub.id} className="slot-row">
                    <span className="slot-time">{formatTime(pub.scheduledAt)}</span>
                    <span style={{ flex: 1 }}>{pub.video.filename}</span>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </div>
                );
              })}
          </div>
        ))
      )}
    </div>
  );
}
