import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Wand2, Plus, Copy, Trash2, Save, Upload, Play, X, RefreshCw,
  CheckCircle2, XCircle, Loader2, ListChecks, History as HistoryIcon, Eye,
} from 'lucide-react';
import { api, formatDuration, formatSize, formatDateTime } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { defaultTemplateConfig, mergeTemplateConfig } from './reelEditor/constants.js';
import TemplateSettingsPanel from './reelEditor/TemplateSettingsPanel.jsx';
import TemplatePreview from './reelEditor/TemplatePreview.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

const STATUS_LABEL = { PENDING: 'Aguardando', PROCESSING: 'Processando', COMPLETED: 'Concluído', FAILED: 'Falhou', CANCELLED: 'Cancelado' };

export default function ReelEditor() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const fileInputRef = useRef(null);

  // ---------- Templates ----------
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState('Novo template');
  const [config, setConfig] = useState(defaultTemplateConfig());
  const [dirty, setDirty] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);

  // ---------- Vídeos de origem ----------
  const [sourceVideos, setSourceVideos] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewId, setPreviewId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ---------- Processamento ----------
  const [concurrency, setConcurrency] = useState(2);
  const [autoQueue, setAutoQueue] = useState(false);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [jobHistory, setJobHistory] = useState([]);
  const pollRef = useRef(null);

  const loadTemplates = useCallback(async () => {
    const { data } = await api.get('/reel-editor/templates');
    setTemplates(data);
    return data;
  }, []);

  const loadVideos = useCallback(async () => {
    const { data } = await api.get('/reel-editor/videos');
    setSourceVideos(data);
  }, []);

  const loadHistory = useCallback(async () => {
    const { data } = await api.get('/reel-editor/jobs');
    setJobHistory(data);
  }, []);

  useEffect(() => {
    (async () => {
      const list = await loadTemplates();
      if (list.length > 0) selectTemplate(list[0]);
      await loadVideos();
      await loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTemplate(row) {
    setTemplateId(row.id);
    setTemplateName(row.name);
    setConfig(mergeTemplateConfig(row.config));
    setDirty(false);
  }

  function updateConfig(next) {
    setConfig(next);
    setDirty(true);
  }

  async function handleNewTemplate() {
    const { data } = await api.post('/reel-editor/templates', { name: 'Novo template', config: defaultTemplateConfig() });
    await loadTemplates();
    selectTemplate(data);
    toast.success('Template criado.');
  }

  async function handleSaveTemplate() {
    setSavingTemplate(true);
    try {
      if (!templateId) {
        const { data } = await api.post('/reel-editor/templates', { name: templateName, config });
        setTemplateId(data.id);
      } else {
        await api.put(`/reel-editor/templates/${templateId}`, { name: templateName, config });
      }
      await loadTemplates();
      setDirty(false);
      toast.success('Template salvo.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao salvar template.');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDuplicateTemplate() {
    if (!templateId) return;
    const { data } = await api.post(`/reel-editor/templates/${templateId}/duplicate`);
    await loadTemplates();
    selectTemplate(data);
    toast.success('Template duplicado.');
  }

  async function handleDeleteTemplate() {
    if (!templateId) return;
    const ok = await confirmAction({ title: 'Excluir template?', description: `"${templateName}" será removido permanentemente.`, danger: true, confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await api.delete(`/reel-editor/templates/${templateId}`);
      const list = await loadTemplates();
      if (list.length > 0) selectTemplate(list[0]);
      else { setTemplateId(null); setTemplateName('Novo template'); setConfig(defaultTemplateConfig()); }
      toast.success('Template excluído.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir template.');
    }
  }

  // ---------- Upload / seleção de vídeos ----------
  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('video/'));
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('videos', f));
    setUploading(true);
    try {
      await api.post('/reel-editor/videos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadVideos();
      toast.success(`${files.length} vídeo(s) enviado(s).`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao enviar vídeos.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (!previewId) setPreviewId(id);
  }

  async function deleteSourceVideo(id, e) {
    e.stopPropagation();
    try {
      await api.delete(`/reel-editor/videos/${id}`);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (previewId === id) setPreviewId(null);
      await loadVideos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover vídeo.');
    }
  }

  const allSourceSelected = sourceVideos.length > 0 && sourceVideos.every((v) => selectedIds.has(v.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSourceSelected) return new Set();
      return new Set(sourceVideos.map((v) => v.id));
    });
  }

  async function deleteSelectedVideos() {
    if (selectedIds.size === 0) return;
    const ok = await confirmAction({
      title: `Excluir ${selectedIds.size} vídeo(s) selecionado(s)?`,
      description: 'Os arquivos serão removidos do disco. Vídeos em uso num processamento ativo não são afetados.',
      danger: true,
      confirmLabel: 'Excluir selecionados',
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const { data } = await api.post('/reel-editor/videos/bulk-delete', { ids: Array.from(selectedIds) });
      toast.success(`${data.deleted} vídeo(s) excluído(s).${data.skipped?.length ? ` ${data.skipped.length} ignorado(s) (em uso).` : ''}`);
      setSelectedIds(new Set());
      if (previewId && !sourceVideos.some((v) => v.id === previewId)) setPreviewId(null);
      await loadVideos();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir vídeos selecionados.');
    } finally {
      setBulkDeleting(false);
    }
  }

  const previewSrc = previewId ? `/api/reel-editor/videos/${previewId}/stream` : null;

  // ---------- Processamento em massa ----------
  async function handleProcess() {
    if (!templateId) { toast.warning('Salve o template antes de processar.'); return; }
    if (dirty) { toast.warning('Você tem alterações não salvas no template. Salve antes de processar.'); return; }
    if (selectedIds.size === 0) { toast.warning('Selecione ao menos um vídeo.'); return; }

    setCreatingJob(true);
    try {
      const { data } = await api.post('/reel-editor/jobs', {
        templateId,
        sourceVideoIds: Array.from(selectedIds),
        concurrency,
        autoQueue,
        autoSchedule,
      });
      setActiveJob(data);
      toast.success(`Processamento de ${data.totalVideos} vídeo(s) iniciado.`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao iniciar processamento.');
    } finally {
      setCreatingJob(false);
    }
  }

  useEffect(() => {
    if (!activeJob) return;
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(activeJob.status)) return;

    pollRef.current = setInterval(async () => {
      const { data } = await api.get(`/reel-editor/jobs/${activeJob.id}`);
      setActiveJob(data);
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.status)) {
        clearInterval(pollRef.current);
        loadHistory();
      }
    }, 1200);

    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

  async function handleCancelJob() {
    if (!activeJob) return;
    const ok = await confirmAction({ title: 'Cancelar processamento?', description: 'Vídeos já concluídos são mantidos. Os pendentes serão cancelados.', danger: true, confirmLabel: 'Cancelar processamento' });
    if (!ok) return;
    try {
      await api.post(`/reel-editor/jobs/${activeJob.id}/cancel`);
      toast.info('Cancelamento solicitado.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao cancelar.');
    }
  }

  async function handleAddToQueue(job) {
    try {
      const { data } = await api.post(`/reel-editor/jobs/${job.id}/add-to-queue`, { autoSchedule });
      toast.success(`${data.added} vídeo(s) adicionados à fila de publicação.`);
      const refreshed = await api.get(`/reel-editor/jobs/${job.id}`);
      setActiveJob(refreshed.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao adicionar à fila.');
    }
  }

  async function retryItem(itemId) {
    try {
      await api.post(`/reel-editor/processed-videos/${itemId}/retry`);
      toast.info('Reprocessando vídeo...');
      const refreshed = await api.get(`/reel-editor/jobs/${activeJob.id}`);
      setActiveJob(refreshed.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao reprocessar.');
    }
  }

  async function deleteResultItem(itemId) {
    try {
      await api.delete(`/reel-editor/processed-videos/${itemId}`);
      const refreshed = await api.get(`/reel-editor/jobs/${activeJob.id}`);
      setActiveJob(refreshed.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao remover item.');
    }
  }

  async function openHistoryJob(job) {
    const { data } = await api.get(`/reel-editor/jobs/${job.id}`);
    setActiveJob(data);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  const counts = useMemo(() => {
    if (!activeJob?.items) return null;
    const c = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, CANCELLED: 0 };
    activeJob.items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }, [activeJob]);

  return (
    <div>
      <div className="page-header">
        <h1>Editor em Massa</h1>
        <p>Configure um template uma vez e aplique automaticamente a centenas de vídeos, sem cortar, sem distorcer e preservando o áudio.</p>
      </div>

      {/* Barra de templates */}
      <div className="re-toolbar">
        <select value={templateId || ''} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) selectTemplate(t); }}>
          {templates.length === 0 && <option value="">Nenhum template salvo</option>}
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          type="text"
          value={templateName}
          onChange={(e) => { setTemplateName(e.target.value); setDirty(true); }}
          style={{ maxWidth: 220 }}
          placeholder="Nome do template"
        />
        <button className="btn btn-sm" onClick={handleNewTemplate}><Plus size={14} /> Novo</button>
        <button className="btn btn-sm" onClick={handleDuplicateTemplate} disabled={!templateId}><Copy size={14} /> Duplicar</button>
        <button className="btn btn-sm btn-danger" onClick={handleDeleteTemplate} disabled={!templateId}><Trash2 size={14} /> Excluir</button>
        <div className="spacer" />
        <label className="checkbox-row" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} />
          Área segura
        </label>
        <button className="btn btn-sm btn-primary" onClick={handleSaveTemplate} disabled={savingTemplate}>
          {savingTemplate ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {dirty ? 'Salvar alterações' : 'Salvo'}
        </button>
      </div>

      {/* Editor + Preview */}
      <div className="re-layout" style={{ marginBottom: 22 }}>
        <TemplateSettingsPanel config={config} onChange={updateConfig} />
        <TemplatePreview config={config} previewSrc={previewSrc} stageWidth={320} showSafeArea={showSafeArea} />
      </div>

      {/* Seleção de vídeos */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
          <span><ListChecks size={16} /> Vídeos selecionados ({selectedIds.size})</span>
          {sourceVideos.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={toggleSelectAll}>
                {allSourceSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              <button className="btn btn-sm btn-danger" disabled={selectedIds.size === 0 || bulkDeleting} onClick={deleteSelectedVideos}>
                {bulkDeleting ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />} Excluir selecionados{selectedIds.size ? ` (${selectedIds.size})` : ''}
              </button>
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        <div
          className={`dropzone${dragOver ? ' drag-over' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ marginBottom: 16 }}
        >
          {uploading ? '⏳ Enviando vídeos...' : <><Upload size={14} style={{ verticalAlign: -2 }} /> Arraste 1 a 500 vídeos aqui ou clique para selecionar</>}
        </div>

        {sourceVideos.length === 0 ? (
          <EmptyState icon={Upload} title="Nenhum vídeo enviado ainda" description="Envie os vídeos originais que serão encaixados no template." />
        ) : (
          <div className="re-video-grid">
            {sourceVideos.map((v) => (
              <div
                key={v.id}
                className={`re-video-card${selectedIds.has(v.id) ? ' selected' : ''}`}
                onClick={() => toggleSelect(v.id)}
              >
                <video src={`/api/reel-editor/videos/${v.id}/stream`} muted preload="metadata" />
                <div className="re-vc-check">{selectedIds.has(v.id) && <CheckCircle2 size={13} />}</div>
                <button className="re-vc-del" title="Remover" onClick={(e) => deleteSourceVideo(v.id, e)}><X size={13} /></button>
                <div className="re-vc-info">
                  <span className="name">{v.filename}</span>
                  <span>{v.width && v.height ? `${v.width}×${v.height} · ` : ''}{formatDuration(v.duration)} · {formatSize(v.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resumo + disparo do processamento */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title"><Wand2 size={16} /> Processar em massa</div>
        <div className="re-summary" style={{ marginBottom: 16 }}>
          <div className="re-summary-row"><span>Vídeos selecionados</span><b>{selectedIds.size}</b></div>
          <div className="re-summary-row"><span>Template</span><b>{templateName}{dirty ? ' (alterações não salvas)' : ''}</b></div>
          <div className="re-summary-row"><span>Formato</span><b>1080 × 1920</b></div>
          <div className="re-summary-row"><span>Modo</span><b>{config.videoContainer.fit === 'contain' ? 'Encaixar sem cortar' : config.videoContainer.fit === 'cover' ? 'Preencher cortando' : 'Fundo desfocado'}</b></div>
          <div className="re-summary-row"><span>Áudio</span><b>{config.audio.preserveOriginal ? 'Preservado' : 'Removido'}</b></div>
        </div>

        <div className="re-row3" style={{ marginBottom: 14 }}>
          <div className="re-field">
            <label>Processamentos simultâneos</label>
            <select value={concurrency} onChange={(e) => setConcurrency(+e.target.value)}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <label className="checkbox-row" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={autoQueue} onChange={(e) => setAutoQueue(e.target.checked)} />
            Adicionar à fila automaticamente
          </label>
          <label className="checkbox-row" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={autoSchedule} onChange={(e) => setAutoSchedule(e.target.checked)} disabled={!autoQueue} />
            Agendar automaticamente
          </label>
        </div>

        <button className="btn btn-primary" onClick={handleProcess} disabled={creatingJob || selectedIds.size === 0}>
          {creatingJob ? <Loader2 size={15} className="spin" /> : <Play size={15} />} PROCESSAR {selectedIds.size || ''} VÍDEO{selectedIds.size === 1 ? '' : 'S'}
        </button>
      </div>

      {/* Fila de processamento / resultados */}
      {activeJob && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="section-title" style={{ justifyContent: 'space-between', display: 'flex' }}>
            <span><RefreshCw size={16} className={activeJob.status === 'PROCESSING' ? 'spin' : ''} /> Processamento — {activeJob.template?.name || templateName}</span>
            {activeJob.status === 'PROCESSING' && (
              <button className="btn btn-sm btn-danger" onClick={handleCancelJob}>Cancelar processamento</button>
            )}
          </div>

          {counts && (
            <div className="re-stat-row" style={{ margin: '10px 0 16px' }}>
              <span>Total: <b>{activeJob.totalVideos}</b></span>
              <span>Processando: <b>{counts.PROCESSING}</b></span>
              <span>Concluídos: <b>{counts.COMPLETED}</b></span>
              <span>Falhos: <b>{counts.FAILED}</b></span>
              {counts.CANCELLED > 0 && <span>Cancelados: <b>{counts.CANCELLED}</b></span>}
              <span className={`badge badge-${activeJob.status === 'COMPLETED' ? 'success' : activeJob.status === 'FAILED' ? 'danger' : activeJob.status === 'CANCELLED' ? 'warning' : 'accent'}`}>
                {activeJob.status}
              </span>
            </div>
          )}

          {activeJob.status !== 'COMPLETED' && activeJob.items?.some((i) => i.status === 'PENDING' || i.status === 'PROCESSING') && (
            <div style={{ marginBottom: 18 }}>
              {activeJob.items.filter((i) => i.status === 'PENDING' || i.status === 'PROCESSING').map((it) => (
                <div key={it.id} className="re-job-item">
                  {it.status === 'PROCESSING' ? <Loader2 size={14} className="spin" /> : <span className="text-faint" style={{ width: 14 }}>·</span>}
                  <span className="re-ji-name">{it.sourceFilename}</span>
                  <div className="re-ji-bar"><div style={{ width: `${it.progress}%` }} /></div>
                  <span className="re-ji-pct">{it.progress}%</span>
                </div>
              ))}
            </div>
          )}

          {activeJob.items?.some((i) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(i.status)) && (
            <>
              <div className="section-title" style={{ fontSize: 13 }}>Resultados</div>
              {activeJob.items.filter((i) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(i.status)).map((it) => (
                <div key={it.id} className="re-result-card">
                  {it.status === 'COMPLETED' ? (
                    <video src={`/api/reel-editor/processed-videos/${it.id}/stream`} muted onClick={(e) => (e.target.paused ? e.target.play() : e.target.pause())} />
                  ) : (
                    <div style={{ width: 60, height: 106, borderRadius: 8, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {it.status === 'FAILED' ? <XCircle size={18} color="var(--danger)" /> : <X size={18} color="var(--text-faint)" />}
                    </div>
                  )}
                  <div className="re-rc-info">
                    <div className="re-rc-name">{it.outputFilename || it.sourceFilename}</div>
                    <span className={`badge badge-${it.status === 'COMPLETED' ? 'success' : it.status === 'FAILED' ? 'danger' : 'neutral'}`} style={{ marginTop: 4, display: 'inline-block' }}>
                      {STATUS_LABEL[it.status]}
                    </span>
                    {it.addedToQueue && <span className="badge badge-accent" style={{ marginTop: 4, marginLeft: 6 }}>Na fila</span>}
                    {it.errorMessage && <div className="re-rc-err">{it.errorMessage}</div>}
                  </div>
                  <div className="actions" style={{ display: 'flex', gap: 6 }}>
                    {it.status === 'FAILED' && <button className="btn btn-sm" onClick={() => retryItem(it.id)}><RefreshCw size={13} /> Tentar novamente</button>}
                    {it.status === 'COMPLETED' && !it.addedToQueue && <button className="btn btn-sm" onClick={() => retryItem(it.id)}>Reprocessar</button>}
                    <button className="btn btn-icon btn-sm btn-danger" onClick={() => deleteResultItem(it.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}

              {activeJob.items.some((i) => i.status === 'COMPLETED' && !i.addedToQueue) && (
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => handleAddToQueue(activeJob)}>
                  Adicionar todos à fila
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Histórico */}
      <div className="card">
        <div className="section-title"><HistoryIcon size={16} /> Histórico de processamentos</div>
        {jobHistory.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Nenhum processamento ainda" />
        ) : (
          jobHistory.map((j) => (
            <div key={j.id} className="re-history-item" onClick={() => openHistoryJob(j)}>
              <Eye size={14} className="text-faint" />
              <span className="re-hi-name">{j.template?.name || 'Template removido'}</span>
              <span className="re-hi-meta">{j.totalVideos} vídeo(s) · {j.completedCount} concluído(s) · {j.failedCount} falha(s)</span>
              <span className={`badge badge-${j.status === 'COMPLETED' ? 'success' : j.status === 'FAILED' ? 'danger' : j.status === 'PROCESSING' ? 'accent' : 'neutral'}`}>{j.status}</span>
              <span className="re-hi-meta">{formatDateTime(j.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
