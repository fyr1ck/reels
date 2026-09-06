import { useEffect, useState } from 'react';
import { api, formatDateTime } from '../api/client.js';

const STATUS_CLASS = {
  SUCCESS: 'badge-success',
  ERROR: 'badge-danger',
  WARNING: 'badge-warning',
  INFO: 'badge-neutral',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await api.get('/logs', { params: { limit: 300 } });
    setLogs(res.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Logs</h1>
        <p>Registro detalhado de todas as ações do sistema, incluindo tentativas e erros.</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-dim">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📝</div>
            Nenhum log registrado ainda.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Data/Hora</th><th>Vídeo</th><th>Ação</th><th>Status</th><th>Tentativa</th><th>Mensagem</th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.timestamp)}</td>
                  <td>{log.video || '—'}</td>
                  <td>{log.action}</td>
                  <td><span className={`badge ${STATUS_CLASS[log.status] || 'badge-neutral'}`}>{log.status}</span></td>
                  <td>{log.attempt ?? '—'}</td>
                  <td className="text-faint" style={{ fontSize: 12 }}>{log.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
