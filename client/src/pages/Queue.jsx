import { useEffect, useState, useRef, useCallback } from 'react';
import { api, formatDuration, formatSize } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useAccounts } from '../context/AccountContext.jsx';

const TABS = [
  { key: 'PENDING', label: 'Pendentes' },
  { key: 'PUBLISHED', label: 'Publicados' },
  { key: 'FAILED', label: 'Falhados' },
];

export default function Queue() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const { selectedId, selected } = useAccounts();

  const [tab, setTab] = useState('PENDING');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [editingCaption, setEditingCaption] = useState(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [publishingId, setPublishingId] = useState(null);
  const fileInputRef = useRef(null);
  const dragIndexRef = useRef(null);

  // ---------- Seleção em massa (selecionar todos / excluir selecionados) ----------
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ---------- Capa personalizada ----------
  const coverInputRef = useRef(null);
  const [coverTargetId, setCoverTargetId] = useState(null);
  const [coverModal, setCoverModal] = useState(null); // { videoId, file, previewUrl, applyToAll }
  const [savingCover, setSavingCover] = useState(false);

  // Capa padrão: saiu das Configurações e veio para cá, que é onde as capas
  // dos vídeos são realmente gerenciadas. Ela é aplicada a cada novo vídeo
  // que entra na fila — decisão que pertence à fila, não a um menu de sistema.
  const [settings, setSettings] = useState(null);
  const [uploadMediaType, setUploadMediaType] = useState('REEL');
  const [uploadingDefaultCover, setUploadingDefaultCover] = useState(false);
  const defaultCoverInputRef = useRef(null);

  const load = useCallback(async (status) => {
    setLoading(true);
    const res = await api.get('/videos', { params: { status } });
    setVideos(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); setSelectedIds(new Set()); }, [tab, load]);

  useEffect(() => { api.get('/settings').then((r) => setSettings(r.data)).catch(() => {}); }, []);

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('video/'));
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((f) => formData.append('videos', f));
    // Sem isso o vídeo cairia sempre na conta padrão como REEL, ignorando o
    // seletor da sidebar e o tipo escolhido aqui.
    if (selectedId) formData.append('accountId', selectedId);
    formData.append('mediaType', uploadMediaType);
    setUploading(true);
    try {
      await api.post('/videos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load(tab);
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao enviar vídeos.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function removeVideo(id) {
    if (!confirm('Remover este vídeo da fila? O arquivo será excluído do disco.')) return;
    try {
      await api.delete(`/videos/${id}`);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await load(tab);
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao remover vídeo.');
    }
  }

  async function publishNow(video) {
    if (!confirm(`Publicar "${video.filename}" AGORA no Instagram, fora do agendamento? Isso abre o navegador da automação em tempo real.`)) return;
    setPublishingId(video.id);
    try {
      await api.post(`/videos/${video.id}/publish-now`);
      alert('✅ Publicado com sucesso! Confira no Instagram e na aba Histórico.');
      await load(tab);
    } catch (e) {
      alert(`❌ Falhou: ${e.response?.data?.error || e.message}\n\nDetalhes completos em Logs.`);
      await load(tab);
    } finally {
      setPublishingId(null);
    }
  }

  function onDragStart(index) { dragIndexRef.current = index; }

  function onDragOverRow(e, index) {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setVideos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      dragIndexRef.current = index;
      return next;
    });
  }

  async function onDragEnd() {
    dragIndexRef.current = null;
    const order = videos.map((v, i) => ({ id: v.id, position: i }));
    try {
      await api.put('/videos/reorder', { order });
    } catch (e) {
      console.error(e);
    }
  }

  function openCaptionEditor(video) {
    setEditingCaption(video.id);
    setCaptionDraft(video.caption || '');
  }

  async function saveCaption(id) {
    try {
      await api.put(`/videos/${id}`, { caption: captionDraft });
      setEditingCaption(null);
      await load(tab);
    } catch (e) {
      alert('Erro ao salvar legenda.');
    }
  }

  // ---------- Seleção em massa ----------
  const selectableIds = videos.filter((v) => v.status !== 'PUBLISHED').map((v) => v.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(selectableIds);
    });
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = await confirmAction({
      title: `Excluir ${selectedIds.size} vídeo(s) selecionado(s)?`,
      description: 'Os arquivos serão removidos do disco. Vídeos já publicados nunca são afetados.',
      danger: true,
      confirmLabel: 'Excluir selecionados',
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const { data } = await api.post('/videos/bulk-delete', { ids: Array.from(selectedIds) });
      toast.success(`${data.deleted} vídeo(s) excluído(s).${data.skipped?.length ? ` ${data.skipped.length} ignorado(s) (já publicados).` : ''}`);
      setSelectedIds(new Set());
      await load(tab);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao excluir vídeos selecionados.');
    } finally {
      setBulkDeleting(false);
    }
  }

  // ---------- Capa personalizada ----------
  function pickCoverFor(videoId) {
    setCoverTargetId(videoId);
    coverInputRef.current?.click();
  }

  function onCoverFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!file || !coverTargetId) return;
    setCoverModal({ videoId: coverTargetId, file, previewUrl: URL.createObjectURL(file), applyToAll: false });
  }

  function closeCoverModal() {
    if (coverModal?.previewUrl) URL.revokeObjectURL(coverModal.previewUrl);
    setCoverModal(null);
  }

  async function confirmCoverModal() {
    if (!coverModal) return;
    setSavingCover(true);
    try {
      const formData = new FormData();
      formData.append('cover', coverModal.file);
      formData.append('applyToAll', coverModal.applyToAll ? 'true' : 'false');
      await api.post(`/videos/${coverModal.videoId}/cover`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(coverModal.applyToAll ? 'Capa aplicada a todos os vídeos pendentes.' : 'Capa adicionada com sucesso.');
      closeCoverModal();
      await load(tab);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Não foi possível carregar a imagem.');
    } finally {
      setSavingCover(false);
    }
  }

  async function removeCover(video) {
    const ok = await confirmAction({
      title: 'Remover capa?',
      description: `A capa individual de "${video.filename}" será removida. Outros vídeos não são afetados.`,
      confirmLabel: 'Remover capa',
    });
    if (!ok) return;
    try {
      await api.delete(`/videos/${video.id}/cover`);
      toast.success('Capa removida.');
      await load(tab);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Erro ao remover capa.');
    }
  }

  async function onDefaultCoverChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('cover', file);
    setUploadingDefaultCover(true);
    try {
      const { data } = await api.post('/settings/default-cover', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSettings(data);
      toast.success('Capa padrão definida.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível carregar a imagem.');
    } finally {
      setUploadingDefaultCover(false);
    }
  }

  async function removeDefaultCover() {
    const ok = await confirmAction({
      title: 'Remover capa padrão?',
      description: 'Apenas a configuração padrão sai. Vídeos que já usam essa imagem como capa individual não são afetados.',
      confirmLabel: 'Remover',
    });
    if (!ok) return;
    try {
      const { data } = await api.delete('/settings/default-cover');
      setSettings(data);
      toast.success('Capa padrão removida.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover a capa padrão.');
    }
  }

  async function toggleUseDefaultCover(checked) {
    try {
      const { data } = await api.put('/settings', { useDefaultCover: checked });
      setSettings(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Fila de vídeos</h1>
        <p>
          Fila de <b>@{selected?.username || '—'}</b>. Novos vídeos entram nesta conta como{' '}
          <b>{uploadMediaType === 'STORY' ? 'story' : 'reel'}</b> — troque a conta no seletor do menu.
        </p>
      </div>

      <div className="upload-type">
        <span className="text-faint">Enviar como:</span>
        <button className={`btn btn-sm${uploadMediaType === 'REEL' ? ' btn-primary' : ''}`}
                onClick={() => setUploadMediaType('REEL')}>Reel</button>
        {/* Story fica desabilitado: a web do Instagram não permite publicá-lo.
            Manter o botão clicável só encheria a fila de vídeos que nunca
            sairiam. Ver server/services/instagramPublisher.js. */}
        <button className="btn btn-sm" disabled
                title="A web do Instagram não permite publicar story em vídeo — só pelo app do celular">
          Story (indisponível)
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={onCoverFileChosen}
      />

      <div
        className={`dropzone${dragOver ? ' drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {uploading ? '⏳ Enviando vídeos...' : '📤 Arraste vídeos aqui ou clique para selecionar (múltiplos arquivos suportados)'}
      </div>

      <input
        ref={defaultCoverInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={onDefaultCoverChosen}
      />

      {settings && (
        <div className="card default-cover-bar">
          <div className="cover-thumb" style={{ width: 44, height: 58 }}>
            {settings.defaultCoverPath
              ? <img src={`/api/covers/${settings.defaultCoverPath}`} alt="Capa padrão" />
              : '🖼️'}
          </div>

          <div className="dcb-text">
            <b>Capa padrão</b>
            <span className="text-faint">
              {settings.defaultCoverPath
                ? 'Aplicada automaticamente a cada novo vídeo que entra na fila.'
                : 'Nenhuma definida — os novos vídeos entram sem capa.'}
            </span>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.useDefaultCover}
              disabled={!settings.defaultCoverPath}
              onChange={(e) => toggleUseDefaultCover(e.target.checked)}
            />
            Usar
          </label>

          <div className="btn-row">
            <button className="btn btn-sm" disabled={uploadingDefaultCover}
                    onClick={() => defaultCoverInputRef.current?.click()}>
              {uploadingDefaultCover ? 'Enviando…' : (settings.defaultCoverPath ? 'Trocar' : 'Escolher imagem')}
            </button>
            {settings.defaultCoverPath && (
              <button className="btn btn-sm btn-danger" onClick={removeDefaultCover}>Remover</button>
            )}
          </div>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {!loading && videos.length > 0 && tab !== 'PUBLISHED' && (
        <div className="queue-toolbar">
          <label className="checkbox-row">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            Selecionar todos
          </label>
          <span className="count">{selectedIds.size} selecionado(s)</span>
          <div className="spacer" />
          <button
            className="btn btn-sm btn-danger"
            disabled={selectedIds.size === 0 || bulkDeleting}
            onClick={deleteSelected}
          >
            {bulkDeleting ? '⏳ Excluindo...' : `🗑️ Excluir selecionados${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-dim">Carregando...</div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎞️</div>
          Nenhum vídeo nesta categoria.
        </div>
      ) : (
        <div className="queue-list">
          {videos.map((v, index) => (
            <div
              key={v.id}
              className="video-row"
              draggable={tab === 'PENDING'}
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOverRow(e, index)}
              onDragEnd={onDragEnd}
            >
              <div className="video-row-main">
                {v.status !== 'PUBLISHED' && (
                  <span className="select">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </span>
                )}
                {tab === 'PENDING' && <span className="position">{index + 1}</span>}
                <div className="thumb" onClick={() => setPreviewVideo(v)}>
                  <video src={`/api/videos/${v.id}/stream`} muted preload="metadata" />
                </div>
                <div className="info">
                  <div className="name">{v.filename}</div>
                  <div className="meta">
                    <span>⏱ {formatDuration(v.duration)}</span>
                    <span>💾 {formatSize(v.size)}</span>
                    {/* Reel e story seguem grades e fluxos de publicação
                        diferentes; sem esse selo os dois ficam indistinguíveis
                        na fila. */}
                    <span className={`badge ${v.mediaType === 'STORY' ? 'badge-warning' : 'badge-neutral'}`} style={{ padding: '2px 8px' }}>
                      {v.mediaType === 'STORY' ? 'story' : 'reel'}
                    </span>
                    <span className={`badge badge-${v.status === 'PUBLISHED' ? 'success' : v.status === 'FAILED' ? 'danger' : 'accent'}`} style={{ padding: '2px 8px' }}>
                      {v.status}
                    </span>
                  </div>
                  {editingCaption === v.id ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Legenda individual para este vídeo"
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => saveCaption(v.id)}>Salvar</button>
                      <button className="btn btn-sm" onClick={() => setEditingCaption(null)}>Cancelar</button>
                    </div>
                  ) : (
                    v.caption && <div className="text-faint" style={{ fontSize: 11.5, marginTop: 5 }}>📝 {v.caption}</div>
                  )}
                </div>
                <div className="actions">
                  <button className="btn btn-icon btn-sm" title="Visualizar" onClick={() => setPreviewVideo(v)}>👁️</button>
                  {tab !== 'PUBLISHED' && (
                    <button className="btn btn-icon btn-sm" title="Editar legenda" onClick={() => openCaptionEditor(v)}>✏️</button>
                  )}
                  {tab !== 'PUBLISHED' && (
                    <button
                      className="btn btn-sm btn-primary"
                      title="Publicar agora (teste manual, fora do agendamento)"
                      disabled={publishingId === v.id}
                      onClick={() => publishNow(v)}
                    >
                      {publishingId === v.id ? '⏳ Publicando...' : '🚀 Publicar agora'}
                    </button>
                  )}
                  {tab !== 'PUBLISHED' && (
                    <button className="btn btn-icon btn-sm btn-danger" title="Remover" onClick={() => removeVideo(v.id)}>🗑️</button>
                  )}
                </div>
              </div>

              {v.status !== 'PUBLISHED' && (
                <div className="video-row-cover">
                  <div className="cover-thumb">
                    {v.coverPath ? <img src={`/api/covers/${v.coverPath}`} alt="Capa" /> : '🖼️'}
                  </div>
                  <div className="cover-label">
                    <b>Foto da capa</b>
                    <span>{v.coverPath ? 'Capa personalizada definida' : 'Nenhuma capa definida'}</span>
                  </div>
                  <div className="cover-actions">
                    <button className="btn btn-sm" onClick={() => pickCoverFor(v.id)}>
                      {v.coverPath ? '🖼️ Alterar capa' : '🖼️ Selecionar do computador'}
                    </button>
                    {v.coverPath && (
                      <button className="btn btn-icon btn-sm btn-danger" title="Remover capa" onClick={() => removeCover(v)}>✕</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewVideo && (
        <div className="modal-overlay" onClick={() => setPreviewVideo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{previewVideo.filename}</h3>
            <video src={`/api/videos/${previewVideo.id}/stream`} controls autoPlay />
            <div className="modal-actions">
              <button className="btn" onClick={() => setPreviewVideo(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {coverModal && (
        <div className="modal-overlay" onClick={savingCover ? undefined : closeCoverModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Aplicar capa</h3>
            <img className="cover-modal-preview" src={coverModal.previewUrl} alt="Prévia da capa" />

            <label className={`cover-scope-option${!coverModal.applyToAll ? ' selected' : ''}`}>
              <input
                type="radio"
                name="cover-scope"
                checked={!coverModal.applyToAll}
                onChange={() => setCoverModal((s) => ({ ...s, applyToAll: false }))}
              />
              <span>Somente neste vídeo</span>
            </label>
            <label className={`cover-scope-option${coverModal.applyToAll ? ' selected' : ''}`}>
              <input
                type="radio"
                name="cover-scope"
                checked={coverModal.applyToAll}
                onChange={() => setCoverModal((s) => ({ ...s, applyToAll: true }))}
              />
              <span>Em todos os vídeos da fila</span>
            </label>

            {coverModal.applyToAll && (
              <p className="cover-scope-warning">
                Essa capa será aplicada a todos os vídeos pendentes da fila. Vídeos já publicados não serão alterados.
              </p>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={closeCoverModal} disabled={savingCover}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmCoverModal} disabled={savingCover}>
                {savingCover ? '⏳ Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
