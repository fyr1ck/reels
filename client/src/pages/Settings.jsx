import { useEffect, useRef, useState } from 'react';
import { api, formatSize, formatDateTime } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

export default function Settings() {
  const toast = useToast();
  const confirmAction = useConfirm();

  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const defaultCoverInputRef = useRef(null);

  const [storage, setStorage] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  const [folderUsage, setFolderUsage] = useState(null);
  const [clearingFolder, setClearingFolder] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  const loadStorage = () => api.get('/settings/storage').then((res) => setStorage(res.data)).catch(() => {});
  const loadFolderUsage = () => api.get('/storage/usage').then((res) => setFolderUsage(res.data)).catch(() => {});

  useEffect(() => {
    api.get('/settings').then((res) => setSettings(res.data));
    loadStorage();
    loadFolderUsage();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.put('/settings', settings);
      setSettings(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function onDefaultCoverChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('cover', file);
    setUploadingCover(true);
    try {
      const { data } = await api.post('/settings/default-cover', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSettings(data);
      toast.success('Capa padrão adicionada com sucesso.');
      loadStorage();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível carregar a imagem.');
    } finally {
      setUploadingCover(false);
    }
  }

  async function removeDefaultCover() {
    const ok = await confirmAction({
      title: 'Remover capa padrão?',
      description: 'Apenas a configuração padrão será removida. Vídeos que já usam essa imagem como capa individual não são afetados.',
      confirmLabel: 'Remover capa padrão',
    });
    if (!ok) return;
    try {
      const { data } = await api.delete('/settings/default-cover');
      setSettings(data);
      toast.success('Capa removida.');
      loadStorage();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao remover capa padrão.');
    }
  }

  async function clearCache() {
    const ok = await confirmAction({
      title: 'Limpar cache?',
      description: 'Isso remove apenas arquivos temporários gerados pelo app. Vídeos pendentes, capas, banco de dados e a sessão do Instagram não são afetados.',
      confirmLabel: 'Limpar cache',
    });
    if (!ok) return;
    setClearingCache(true);
    try {
      const { data } = await api.post('/settings/clear-cache');
      setStorage(data.storage);
      setSettings(data.settings);
      toast.success(`Cache limpo com sucesso (${data.itemsRemoved} item(ns) removido(s)).`);
    } catch (err) {
      const status = err.response?.status;
      const serverMessage = typeof err.response?.data?.error === 'string' ? err.response.data.error : null;
      toast.error(
        serverMessage
          || (status ? `Erro ao limpar cache (HTTP ${status}). Se você acabou de atualizar o código, reinicie o servidor (npm run dev / npm start) e rode "npx prisma generate".` : 'Erro ao limpar cache. Verifique se o servidor está rodando.')
      );
    } finally {
      setClearingCache(false);
    }
  }

  const FOLDER_META = [
    { key: 'pending', label: 'Vídeos pendentes', warn: 'Apaga TODOS os vídeos ainda não publicados da fila e seus agendamentos. Não afeta os já publicados.' },
    { key: 'failed', label: 'Vídeos falhados', warn: 'Apaga os vídeos que falharam definitivamente na publicação.' },
    { key: 'published', label: 'Vídeos publicados (arquivos)', warn: 'Libera espaço apagando os arquivos de vídeo já publicados. O histórico (nome, data) continua salvo no banco.' },
    { key: 'covers', label: 'Capas', warn: 'Remove todas as capas — individuais e a padrão — de todos os vídeos.' },
    { key: 'editor-source', label: 'Editor em massa — vídeos de origem', warn: 'Apaga os vídeos enviados para o Editor em Massa que ainda não foram processados.' },
    { key: 'editor-output', label: 'Editor em massa — vídeos processados', warn: 'Apaga os vídeos já processados (resultado) do Editor em Massa.' },
    { key: 'editor-assets', label: 'Editor em massa — recursos (fotos/logos/fundos)', warn: 'Apaga fotos de perfil, logos e fundos usados nos templates.' },
    { key: 'editor-tmp', label: 'Cache / temporário', warn: 'Arquivos intermediários gerados durante o processamento. Seguro limpar a qualquer momento.' },
  ];

  async function clearFolderAction(meta) {
    const ok = await confirmAction({
      title: `Limpar "${meta.label}"?`,
      description: meta.warn,
      danger: true,
      confirmLabel: 'Limpar',
    });
    if (!ok) return;
    setClearingFolder(meta.key);
    try {
      const { data } = await api.post(`/storage/clear/${meta.key}`);
      setFolderUsage(data.storage);
      if (data.blocked) toast.error(data.blocked);
      else toast.success(`${meta.label}: ${data.itemsRemoved} item(ns) removido(s).`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao limpar pasta.');
    } finally {
      setClearingFolder(null);
    }
  }

  async function clearAllFoldersAction() {
    const ok = await confirmAction({
      title: 'Limpar TUDO?',
      description: 'Isso apaga vídeos pendentes, falhados, capas, arquivos publicados e tudo do Editor em Massa. Essa ação não pode ser desfeita.',
      danger: true,
      confirmLabel: 'Sim, limpar tudo',
    });
    if (!ok) return;
    setClearingAll(true);
    try {
      const { data } = await api.post('/storage/clear-all');
      setFolderUsage(data.storage);
      const blockedOnes = Object.entries(data.results).filter(([, r]) => r.blocked);
      if (blockedOnes.length > 0) {
        toast.error(`Algumas pastas não foram limpas: ${blockedOnes.map(([k]) => k).join(', ')}.`);
      } else {
        toast.success('Todas as pastas foram limpas.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao limpar tudo.');
    } finally {
      setClearingAll(false);
    }
  }

  if (!settings) return <div className="text-dim">Carregando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Configurações</h1>
        <p>Legenda padrão utilizada nos vídeos e preferências gerais da automação.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3 className="section-title">📝 Legenda padrão</h3>
        <label className="field-label">Texto usado em todos os vídeos que não têm legenda individual</label>
        <textarea
          rows={4}
          value={settings.defaultCaption}
          onChange={(e) => setSettings((s) => ({ ...s, defaultCaption: e.target.value }))}
          placeholder="🚀 Transforme sua presença digital. Confira o link da bio!"
        />

        <div style={{ marginTop: 12 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.useDefaultCaption}
              onChange={(e) => setSettings((s) => ({ ...s, useDefaultCaption: e.target.checked }))}
            />
            Usar legenda padrão em todos os vídeos (quando não houver legenda individual definida)
          </label>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h3 className="section-title">🖼️ Foto da capa padrão</h3>
        <label className="field-label">Aplicada automaticamente a novos vídeos adicionados à fila</label>

        <input
          ref={defaultCoverInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={onDefaultCoverChosen}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div className="cover-thumb" style={{ width: 60, height: 80 }}>
            {settings.defaultCoverPath ? (
              <img src={`/api/covers/${settings.defaultCoverPath}`} alt="Capa padrão" />
            ) : '🖼️'}
          </div>
          <div className="btn-row">
            <button className="btn btn-sm" disabled={uploadingCover} onClick={() => defaultCoverInputRef.current?.click()}>
              {uploadingCover ? '⏳ Enviando...' : '🖼️ Selecionar do computador'}
            </button>
            {settings.defaultCoverPath && (
              <button className="btn btn-sm btn-danger" onClick={removeDefaultCover}>Remover capa padrão</button>
            )}
          </div>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.useDefaultCover}
            onChange={(e) => setSettings((s) => ({ ...s, useDefaultCover: e.target.checked }))}
            disabled={!settings.defaultCoverPath}
          />
          Usar capa padrão para novos vídeos
        </label>
        {!settings.defaultCoverPath && (
          <p className="text-faint" style={{ fontSize: 12, marginTop: 8 }}>
            Selecione uma imagem acima para poder ativar esta opção.
          </p>
        )}
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h3 className="section-title">🗄️ Armazenamento</h3>

        {storage && (
          <div className="re-summary" style={{ marginBottom: 14 }}>
            <div className="re-summary-row"><span>Vídeos pendentes</span><b>{formatSize(storage.pendingBytes)}</b></div>
            <div className="re-summary-row"><span>Capas</span><b>{formatSize(storage.coversBytes)}</b></div>
            <div className="re-summary-row"><span>Cache</span><b>{formatSize(storage.cacheBytes)}</b></div>
          </div>
        )}

        <div className="btn-row" style={{ marginBottom: 8 }}>
          <button className="btn btn-sm" disabled={clearingCache} onClick={clearCache}>
            {clearingCache ? '⏳ Limpando...' : '🧹 Limpar cache'}
          </button>
        </div>
        <p className="text-faint" style={{ fontSize: 12, marginBottom: 6 }}>
          Última limpeza: {settings.lastCacheCleanAt ? formatDateTime(settings.lastCacheCleanAt) : 'nunca'}
        </p>
        <p className="text-faint" style={{ fontSize: 12, marginBottom: 14 }}>
          Remove apenas arquivos temporários gerados pelo app. Nunca apaga vídeos pendentes, banco de dados, configurações ou a sessão do Instagram.
        </p>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.cacheAutoCleanEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, cacheAutoCleanEnabled: e.target.checked }))}
          />
          Limpar cache automaticamente
        </label>
        {settings.cacheAutoCleanEnabled && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>A cada</span>
            <input
              type="number"
              min={1}
              style={{ width: 70 }}
              value={settings.cacheAutoCleanIntervalHours}
              onChange={(e) => setSettings((s) => ({ ...s, cacheAutoCleanIntervalHours: Math.max(1, +e.target.value || 1) }))}
            />
            <span>horas</span>
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: 16, borderColor: 'var(--danger)' }}>
        <h3 className="section-title">🧨 Zona de risco — limpar arquivos</h3>
        <p className="text-faint" style={{ fontSize: 12, marginBottom: 14 }}>
          Limpa os arquivos de cada pasta individualmente, ou tudo de uma vez. Sempre pede confirmação antes de agir.
        </p>

        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-danger" disabled={clearingAll} onClick={clearAllFoldersAction}>
            {clearingAll ? '⏳ Limpando tudo...' : '🧨 Limpar tudo'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FOLDER_META.map((meta) => (
            <div key={meta.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-soft)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                <div className="text-faint" style={{ fontSize: 11.5 }}>
                  {folderUsage ? formatSize(folderUsage[meta.key]) : '...'}
                </div>
              </div>
              <button
                className="btn btn-sm btn-danger"
                disabled={clearingFolder === meta.key || clearingAll}
                onClick={() => clearFolderAction(meta)}
              >
                {clearingFolder === meta.key ? '⏳...' : 'Limpar'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h3 className="section-title">🖥️ Navegador</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.keepBrowserOpen}
            onChange={(e) => setSettings((s) => ({ ...s, keepBrowserOpen: e.target.checked }))}
          />
          Manter a janela do navegador aberta entre publicações
        </label>
        <p className="text-faint" style={{ fontSize: 12, marginTop: 8 }}>
          Também pode ser ajustado em <code>HEADLESS</code> no arquivo <code>.env</code>. Recomenda-se manter o navegador visível para permitir intervenção manual quando necessário.
        </p>
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Salvando...' : '💾 Salvar configurações'}
        </button>
        {saved && <span className="badge badge-success">Salvo com sucesso</span>}
      </div>
    </div>
  );
}
