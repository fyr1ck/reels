import { useCallback, useEffect, useState } from 'react';
import { FolderPlus, RefreshCw, Trash2, Power, AlertTriangle, FolderSync } from 'lucide-react';
import { api, formatDateTime } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

export default function Pastas() {
  const toast = useToast();
  const confirmAction = useConfirm();

  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ path: '', label: '', importMode: 'COPY', autoCaption: false });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/watch-folders');
      setFolders(data);
    } catch {
      toast.error('Não foi possível carregar as pastas.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function addFolder(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/watch-folders', form);
      setForm({ path: '', label: '', importMode: 'COPY', autoCaption: false });
      await load();
      toast.success('Pasta cadastrada. A varredura acontece a cada 2 minutos.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar a pasta.');
    }
  }

  async function patch(folder, data) {
    await api.put(`/watch-folders/${folder.id}`, data);
    await load();
  }

  async function removeFolder(folder) {
    const ok = await confirmAction({
      title: 'Parar de monitorar',
      description:
        'O app deixa de olhar essa pasta. Nada é apagado: nem os arquivos na origem, nem os vídeos que já entraram na fila.',
      confirmLabel: 'Parar',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/watch-folders/${folder.id}`);
    await load();
    toast.success('Pasta removida do monitoramento.');
  }

  async function scanNow(folder) {
    setScanning(true);
    try {
      const { data } = await (folder
        ? api.post(`/watch-folders/${folder.id}/scan`)
        : api.post('/watch-folders/scan'));
      await load();
      const n = data.imported ?? 0;
      if (n > 0) toast.success(`${n} vídeo(s) importado(s) para a fila.`);
      else toast.info('Nenhum vídeo novo encontrado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao varrer.');
    } finally {
      setScanning(false);
    }
  }

  if (loading) return <div className="card">Carregando pastas…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Pastas monitoradas</h2>
          <p className="text-dim">
            Todo vídeo novo que aparecer nessas pastas entra na fila sozinho. É uma pasta
            <b>do seu computador</b>, não um link. Se você usa Google Drive, OneDrive ou Dropbox
            com o app de computador instalado, aponte para a pasta que eles sincronizam: você
            joga o arquivo lá e ele vira publicação.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => scanNow(null)} disabled={scanning}>
          <RefreshCw size={14} /> {scanning ? 'Varrendo…' : 'Varrer agora'}
        </button>
      </div>

      <div className="card">
        <h3 className="section-title">➕ Nova pasta</h3>
        <form onSubmit={addFolder}>
          <input
            placeholder="Caminho no computador. Ex: C:\Users\Vinicin\Videos\Reels"
            value={form.path}
            onChange={(e) => setForm({ ...form, path: e.target.value })}
          />
          <div className="wf-form-row">
            <input
              placeholder="Apelido (opcional)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <select
              value={form.importMode}
              onChange={(e) => setForm({ ...form, importMode: e.target.value })}
            >
              <option value="COPY">Copiar (mantém o original)</option>
              <option value="MOVE">Mover (remove da origem)</option>
            </select>
            <button className="btn btn-primary" type="submit">
              <FolderPlus size={15} /> Adicionar
            </button>
          </div>
          <label className="checkbox-row" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={form.autoCaption}
              onChange={(e) => setForm({ ...form, autoCaption: e.target.checked })}
            />
            Já aplicar uma legenda da biblioteca na importação
          </label>
          {error && <div className="banner banner-danger" style={{ marginTop: 12 }}>{error}</div>}
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-title">📁 Monitorando ({folders.filter((f) => f.enabled).length} ativas)</h3>

        {folders.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📁</div>
            Nenhuma pasta ainda. Cadastre uma acima para a fila encher sozinha.
          </div>
        ) : (
          <div className="wf-list">
            {folders.map((f) => (
              <div key={f.id} className={`wf-item${f.enabled ? '' : ' disabled'}`}>
                <div className="wf-item-main">
                  <div className="wf-item-head">
                    <FolderSync size={15} />
                    <b>{f.label || f.path.split(/[\\/]/).pop()}</b>
                    <span className={`badge ${f.importMode === 'MOVE' ? 'badge-warning' : 'badge-neutral'}`}>
                      {f.importMode === 'MOVE' ? 'move' : 'copia'}
                    </span>
                    {f.autoCaption && <span className="badge badge-accent">legenda auto</span>}
                    {!f.reachable && <span className="badge badge-danger">inacessível</span>}
                  </div>

                  <code className="wf-path">{f.path}</code>

                  <div className="wf-stats">
                    <span><b>{f.newFiles}</b> novo(s) aguardando</span>
                    <span className="text-faint">{f.filesInFolder} vídeo(s) na pasta</span>
                    <span className="text-faint">{f.importedCount} já importado(s)</span>
                    <span className="text-faint">
                      última varredura: {f.lastScanAt ? formatDateTime(f.lastScanAt) : 'nunca'}
                    </span>
                  </div>

                  {(f.lastError || f.error) && (
                    <div className="wf-error">
                      <AlertTriangle size={13} /> {f.lastError || f.error}
                    </div>
                  )}
                </div>

                <div className="btn-row wf-actions">
                  <button className="btn btn-sm" onClick={() => scanNow(f)} disabled={scanning}>
                    <RefreshCw size={13} /> Varrer
                  </button>
                  <button className="btn btn-sm" onClick={() => patch(f, { enabled: !f.enabled })}>
                    <Power size={13} /> {f.enabled ? 'Ativa' : 'Inativa'}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => removeFolder(f)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-faint" style={{ marginTop: 14 }}>
          Arquivos gravados há menos de 15 segundos são ignorados na varredura — é o tempo que o
          sincronizador leva para terminar de baixar. Sem isso, um vídeo pela metade entraria na fila.
        </p>
      </div>
    </>
  );
}
