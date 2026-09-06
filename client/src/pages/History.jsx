import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api/client.js';

const STATUS_LABEL = {
  SCHEDULED: { label: 'Agendado', cls: 'badge-accent' },
  PUBLISHING: { label: 'Publicando', cls: 'badge-warning' },
  PUBLISHED: { label: 'Publicado', cls: 'badge-success' },
  FAILED: { label: 'Falhou', cls: 'badge-danger' },
};

export default function History() {
  const [publications, setPublications] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/publications').then((res) => {
      setPublications(res.data);
      setLoading(false);
    });
  }, []);

  const filtered = filter === 'ALL' ? publications : publications.filter((p) => p.status === filter);

  return (
    <div>
      <div className="page-header">
        <h1>Histórico</h1>
        <p>Todas as tentativas de publicação, com resultado, tentativas e horário agendado.</p>
      </div>

      <div className="tabs">
        {['ALL', 'PUBLISHED', 'FAILED', 'SCHEDULED', 'PUBLISHING'].map((f) => (
          <div key={f} className={`tab${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'Todos' : (STATUS_LABEL[f]?.label || f)}
          </div>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="text-dim">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🗂️</div>
            Nenhum registro encontrado.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vídeo</th><th>Agendado para</th><th>Publicado em</th><th>Tentativas</th><th>Status</th><th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const st = STATUS_LABEL[p.status] || STATUS_LABEL.SCHEDULED;
                return (
                  <tr key={p.id}>
                    <td>{p.video.filename}</td>
                    <td>{formatDateTime(p.scheduledAt)}</td>
                    <td>{formatDateTime(p.publishedAt)}</td>
                    <td>{p.attempts}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td className="text-faint" style={{ fontSize: 12 }}>{p.errorMessage || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
