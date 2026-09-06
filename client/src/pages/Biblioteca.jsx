import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Power, Wand2, Eye } from 'lucide-react';
import { api } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

const MAX_HASHTAGS = 30;

export default function Biblioteca() {
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState('legendas');
  const [captions, setCaptions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  // formulários
  const [newCaption, setNewCaption] = useState({ text: '', label: '', weight: 1 });
  const [newGroup, setNewGroup] = useState({ name: '', hashtags: '' });

  // aplicação em lote
  const [applyOpts, setApplyOpts] = useState({
    useCaptions: true,
    useHashtags: true,
    hashtagGroupId: '',
    overwrite: false,
  });
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: c }, { data: g }] = await Promise.all([
        api.get('/library/captions'),
        api.get('/library/hashtags'),
      ]);
      setCaptions(c);
      setGroups(g);
    } catch {
      toast.error('Não foi possível carregar a biblioteca.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ---------- legendas ----------

  async function addCaption(e) {
    e.preventDefault();
    if (!newCaption.text.trim()) return;
    try {
      await api.post('/library/captions', newCaption);
      setNewCaption({ text: '', label: '', weight: 1 });
      await load();
      toast.success('Legenda adicionada.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar legenda.');
    }
  }

  async function toggleCaption(c) {
    await api.put(`/library/captions/${c.id}`, { enabled: !c.enabled });
    await load();
  }

  async function removeCaption(c) {
    const ok = await confirm({
      title: 'Remover legenda',
      description: 'Essa legenda sai da biblioteca. Vídeos que já receberam o texto não são alterados.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/library/captions/${c.id}`);
    await load();
    toast.success('Legenda removida.');
  }

  // ---------- hashtags ----------

  async function addGroup(e) {
    e.preventDefault();
    try {
      await api.post('/library/hashtags', newGroup);
      setNewGroup({ name: '', hashtags: '' });
      await load();
      toast.success('Grupo criado.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar grupo.');
    }
  }

  async function toggleGroup(g) {
    await api.put(`/library/hashtags/${g.id}`, { enabled: !g.enabled });
    await load();
  }

  async function removeGroup(g) {
    const ok = await confirm({
      title: 'Remover grupo',
      description: `O grupo "${g.name}" sai da biblioteca. Legendas já aplicadas continuam como estão.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/library/hashtags/${g.id}`);
    await load();
    toast.success('Grupo removido.');
  }

  // ---------- aplicação em lote ----------

  async function runPreview() {
    setPreview(null);
    try {
      const { data } = await api.post('/library/preview', applyOpts);
      setPreview(data);
      if (data.updated === 0) toast.info('Nenhum vídeo da fila se encaixa nos critérios.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao simular.');
    }
  }

  async function runApply() {
    const ok = await confirm({
      title: 'Aplicar na fila',
      description: applyOpts.overwrite
        ? 'As legendas atuais dos vídeos pendentes/agendados serão SOBRESCRITAS. Não há desfazer.'
        : 'Os vídeos sem legenda receberão um texto da biblioteca. Os que já têm legenda ficam intocados.',
      confirmLabel: 'Aplicar',
      danger: applyOpts.overwrite,
    });
    if (!ok) return;

    setApplying(true);
    try {
      const { data } = await api.post('/library/apply', applyOpts);
      setPreview(data);
      toast.success(`${data.updated} vídeo(s) atualizado(s).`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aplicar.');
    } finally {
      setApplying(false);
    }
  }

  if (loading) return <div className="card">Carregando biblioteca…</div>;

  const activeCaptions = captions.filter((c) => c.enabled).length;
  const activeGroups = groups.filter((g) => g.enabled).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Legendas & Hashtags</h2>
          <p className="text-dim">
            Cadastre uma vez e aplique em lote na fila. O rodízio distribui os textos de forma
            equilibrada, em vez de repetir sempre o mesmo.
          </p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'legendas' ? ' active' : ''}`} onClick={() => setTab('legendas')}>
          Legendas ({activeCaptions})
        </button>
        <button className={`tab${tab === 'hashtags' ? ' active' : ''}`} onClick={() => setTab('hashtags')}>
          Hashtags ({activeGroups})
        </button>
        <button className={`tab${tab === 'aplicar' ? ' active' : ''}`} onClick={() => setTab('aplicar')}>
          Aplicar na fila
        </button>
      </div>

      {tab === 'legendas' && (
        <>
          <div className="card">
            <h3 className="section-title">➕ Nova legenda</h3>
            <form onSubmit={addCaption}>
              <textarea
                rows={3}
                placeholder="Escreva a legenda. Ex: Mais um lance absurdo dessa temporada 🔥"
                value={newCaption.text}
                onChange={(e) => setNewCaption({ ...newCaption, text: e.target.value })}
              />
              <div className="lib-form-row">
                <input
                  placeholder="Apelido (opcional)"
                  value={newCaption.label}
                  onChange={(e) => setNewCaption({ ...newCaption, label: e.target.value })}
                />
                <label className="lib-weight" title="Peso: quanto maior, mais vezes essa legenda é sorteada">
                  Peso
                  <input
                    type="number" min="1" max="10"
                    value={newCaption.weight}
                    onChange={(e) => setNewCaption({ ...newCaption, weight: Number(e.target.value) })}
                  />
                </label>
                <button className="btn btn-primary" type="submit">
                  <Plus size={15} /> Adicionar
                </button>
              </div>
            </form>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 className="section-title">📝 Legendas cadastradas ({captions.length})</h3>
            {captions.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📝</div>
                Nenhuma legenda ainda. Cadastre algumas acima para o rodízio ter de onde escolher.
              </div>
            ) : (
              <div className="lib-list">
                {captions.map((c) => (
                  <div key={c.id} className={`lib-item${c.enabled ? '' : ' disabled'}`}>
                    <div className="lib-item-main">
                      <div className="lib-item-head">
                        {c.label && <span className="badge badge-neutral">{c.label}</span>}
                        <span className="badge badge-accent">peso {c.weight}</span>
                        <span className="text-faint">usada {c.usedCount}x</span>
                      </div>
                      <p className="lib-item-text">{c.text}</p>
                    </div>
                    <div className="btn-row">
                      <button className="btn btn-sm" onClick={() => toggleCaption(c)} title={c.enabled ? 'Desativar' : 'Ativar'}>
                        <Power size={14} /> {c.enabled ? 'Ativa' : 'Inativa'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => removeCaption(c)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'hashtags' && (
        <>
          <div className="card">
            <h3 className="section-title">➕ Novo grupo</h3>
            <form onSubmit={addGroup}>
              <input
                placeholder="Nome do grupo. Ex: futebol"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              />
              <textarea
                rows={3}
                style={{ marginTop: 10 }}
                placeholder="futebol gols copa viral — com ou sem #, separadas por espaço, vírgula ou linha"
                value={newGroup.hashtags}
                onChange={(e) => setNewGroup({ ...newGroup, hashtags: e.target.value })}
              />
              <div className="lib-form-row">
                <span className="text-faint">
                  O # é adicionado sozinho e as repetidas são descartadas. Limite do Instagram: {MAX_HASHTAGS}.
                </span>
                <button className="btn btn-primary" type="submit">
                  <Plus size={15} /> Criar grupo
                </button>
              </div>
            </form>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 className="section-title"># Grupos cadastrados ({groups.length})</h3>
            {groups.length === 0 ? (
              <div className="empty-state">
                <div className="icon">#</div>
                Nenhum grupo ainda.
              </div>
            ) : (
              <div className="lib-list">
                {groups.map((g) => (
                  <div key={g.id} className={`lib-item${g.enabled ? '' : ' disabled'}`}>
                    <div className="lib-item-main">
                      <div className="lib-item-head">
                        <b>{g.name}</b>
                        <span className={`badge ${g.overLimit ? 'badge-warning' : 'badge-neutral'}`}>
                          {g.count} hashtags
                        </span>
                        <span className="text-faint">usado {g.usedCount}x</span>
                      </div>
                      <div className="lib-tags">
                        {g.parsed.map((t, i) => (
                          <span key={t} className={`lib-tag${i >= MAX_HASHTAGS ? ' over' : ''}`}>{t}</span>
                        ))}
                      </div>
                      {g.overLimit && (
                        <p className="text-faint" style={{ marginTop: 6 }}>
                          Acima de {MAX_HASHTAGS}: as excedentes (em vermelho) são cortadas na publicação.
                        </p>
                      )}
                    </div>
                    <div className="btn-row">
                      <button className="btn btn-sm" onClick={() => toggleGroup(g)}>
                        <Power size={14} /> {g.enabled ? 'Ativo' : 'Inativo'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => removeGroup(g)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'aplicar' && (
        <>
          <div className="card">
            <h3 className="section-title">⚙️ O que aplicar</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={applyOpts.useCaptions}
                onChange={(e) => setApplyOpts({ ...applyOpts, useCaptions: e.target.checked })}
              />
              Usar legendas da biblioteca ({activeCaptions} ativas)
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={applyOpts.useHashtags}
                onChange={(e) => setApplyOpts({ ...applyOpts, useHashtags: e.target.checked })}
              />
              Anexar hashtags
            </label>

            {applyOpts.useHashtags && (
              <div style={{ margin: '10px 0 4px 26px' }}>
                <select
                  value={applyOpts.hashtagGroupId}
                  onChange={(e) => setApplyOpts({ ...applyOpts, hashtagGroupId: e.target.value })}
                >
                  <option value="">Rodízio entre todos os grupos ativos</option>
                  {groups.filter((g) => g.enabled).map((g) => (
                    <option key={g.id} value={g.id}>Sempre o grupo "{g.name}"</option>
                  ))}
                </select>
              </div>
            )}

            <label className="checkbox-row" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={applyOpts.overwrite}
                onChange={(e) => setApplyOpts({ ...applyOpts, overwrite: e.target.checked })}
              />
              Sobrescrever legendas já preenchidas
            </label>
            <p className="text-faint" style={{ margin: '4px 0 0 26px' }}>
              Desmarcado, só os vídeos sem legenda são tocados — é o modo seguro.
            </p>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={runPreview}>
                <Eye size={15} /> Simular
              </button>
              <button className="btn btn-primary" onClick={runApply} disabled={applying}>
                <Wand2 size={15} /> {applying ? 'Aplicando…' : 'Aplicar na fila'}
              </button>
            </div>
            <p className="text-faint" style={{ marginTop: 10 }}>
              Só o texto da legenda muda. Agendamento, ordem da fila e arquivos não são tocados.
              Vídeos já publicados ou com falha ficam de fora.
            </p>
          </div>

          {preview && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 className="section-title">👀 Resultado</h3>
              <div className="grid grid-3">
                <div className="stat-card">
                  <div className="label">Vídeos atingidos</div>
                  <div className="value">{preview.updated}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Preservados</div>
                  <div className="value">{preview.skipped}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Legendas distintas</div>
                  <div className="value">{preview.captionsUsed}</div>
                </div>
              </div>

              {preview.preview.length > 0 && (
                <div className="lib-preview">
                  {preview.preview.map((p) => (
                    <div key={p.filename} className="lib-preview-item">
                      <div className="text-faint">{p.filename}</div>
                      <pre>{p.caption}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
