import { useCallback, useEffect, useState } from 'react';
import { HardDrive, Brush, Bomb, RefreshCw } from 'lucide-react';
import { api, formatSize, formatDateTime } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';

// Cada pasta com o que exatamente se perde ao limpá-la. O texto vai para o
// diálogo de confirmação — é a última chance do usuário entender o estrago.
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

export default function Armazenamento() {
  const toast = useToast();
  const confirmAction = useConfirm();

  const [settings, setSettings] = useState(null);
  const [storage, setStorage] = useState(null);
  const [folderUsage, setFolderUsage] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingFolder, setClearingFolder] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  const load = useCallback(async () => {
    const [s, st, fu] = await Promise.all([
      api.get('/settings'),
      api.get('/settings/storage').catch(() => ({ data: null })),
      api.get('/storage/usage').catch(() => ({ data: null })),
    ]);
    setSettings(s.data);
    setStorage(st.data);
    setFolderUsage(fu.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * A limpeza automática salva na hora em vez de esperar um botão "Salvar".
   * Era o único ajuste desta tela e manter um botão de salvar só para ele
   * seria uma etapa a mais sem ganho.
   */
  async function saveAutoClean(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingAuto(true);
    try {
      const { data } = await api.put('/settings', {
        cacheAutoCleanEnabled: next.cacheAutoCleanEnabled,
        cacheAutoCleanIntervalHours: next.cacheAutoCleanIntervalHours,
      });
      setSettings(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar.');
      await load(); // desfaz o otimismo se o servidor recusou
    } finally {
      setSavingAuto(false);
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
      toast.success(`Cache limpo (${data.itemsRemoved} item(ns) removido(s)).`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao limpar cache.');
    } finally {
      setClearingCache(false);
    }
  }

  async function clearFolder(meta) {
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

  async function clearAll() {
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
      const bloqueadas = Object.entries(data.results).filter(([, r]) => r.blocked);
      if (bloqueadas.length > 0) {
        toast.error(`Algumas pastas não foram limpas: ${bloqueadas.map(([k]) => k).join(', ')}.`);
      } else {
        toast.success('Todas as pastas foram limpas.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao limpar tudo.');
    } finally {
      setClearingAll(false);
    }
  }

  if (!settings) return <div className="card">Carregando armazenamento…</div>;

  const total = folderUsage
    ? FOLDER_META.reduce((soma, m) => soma + (folderUsage[m.key] || 0), 0)
    : null;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2>Armazenamento</h2>
          <p className="text-dim">
            Quanto espaço cada pasta ocupa e como liberá-lo. Toda limpeza pede confirmação
            dizendo exatamente o que se perde.
          </p>
        </div>
        <button className="btn btn-sm" onClick={load}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat-card">
          <span className="stat-label"><HardDrive size={13} /> Total em disco</span>
          <span className="stat-value">{total == null ? '—' : formatSize(total)}</span>
          <span className="stat-sub">somando todas as pastas</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Vídeos pendentes</span>
          <span className="stat-value">{storage ? formatSize(storage.pendingBytes) : '—'}</span>
          <span className="stat-sub">aguardando publicação</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Capas</span>
          <span className="stat-value">{storage ? formatSize(storage.coversBytes) : '—'}</span>
          <span className="stat-sub">imagens de capa</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Cache</span>
          <span className="stat-value">{storage ? formatSize(storage.cacheBytes) : '—'}</span>
          <span className="stat-sub">temporários do app</span>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title"><Brush size={15} /> Limpeza de cache</h3>
        <p className="text-faint" style={{ fontSize: 12, marginBottom: 12 }}>
          Remove apenas arquivos temporários gerados pelo app. Nunca apaga vídeos pendentes,
          banco de dados, configurações ou a sessão do Instagram.
        </p>

        <div className="btn-row" style={{ marginBottom: 10 }}>
          <button className="btn" disabled={clearingCache} onClick={clearCache}>
            <Brush size={14} /> {clearingCache ? 'Limpando…' : 'Limpar cache agora'}
          </button>
          <span className="text-faint" style={{ alignSelf: 'center', fontSize: 12 }}>
            Última limpeza: {settings.lastCacheCleanAt ? formatDateTime(settings.lastCacheCleanAt) : 'nunca'}
          </span>
        </div>

        <label className="checkbox-row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={settings.cacheAutoCleanEnabled}
            disabled={savingAuto}
            onChange={(e) => saveAutoClean({ cacheAutoCleanEnabled: e.target.checked })}
          />
          Limpar cache automaticamente
        </label>

        {settings.cacheAutoCleanEnabled && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span>A cada</span>
            <input
              type="number"
              min={1}
              max={720}
              style={{ width: 80 }}
              value={settings.cacheAutoCleanIntervalHours}
              disabled={savingAuto}
              onChange={(e) => saveAutoClean({
                // O servidor aceita de 1 a 720h; travar aqui evita um 400 que
                // o usuário só descobriria ao salvar.
                cacheAutoCleanIntervalHours: Math.min(720, Math.max(1, +e.target.value || 1)),
              })}
            />
            <span>horas <span className="text-faint">(máx. 720 = 30 dias)</span></span>
          </div>
        )}
      </div>

      <div className="card danger-zone" style={{ marginTop: 16 }}>
        <h3 className="section-title"><Bomb size={15} /> Zona de risco — apagar arquivos</h3>
        <p className="text-faint" style={{ fontSize: 12, marginBottom: 14 }}>
          Apaga os arquivos de cada pasta individualmente, ou tudo de uma vez. Nada aqui pode
          ser desfeito.
        </p>

        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-danger" disabled={clearingAll} onClick={clearAll}>
            <Bomb size={14} /> {clearingAll ? 'Apagando tudo…' : 'Apagar tudo'}
          </button>
        </div>

        <div className="dz-list">
          {FOLDER_META.map((meta) => (
            <div key={meta.key} className="dz-row">
              <div className="dz-info">
                <div className="dz-name">{meta.label}</div>
                <div className="text-faint">{folderUsage ? formatSize(folderUsage[meta.key]) : '…'}</div>
              </div>
              <button
                className="btn btn-sm btn-danger"
                disabled={clearingFolder === meta.key || clearingAll}
                onClick={() => clearFolder(meta)}
              >
                {clearingFolder === meta.key ? 'Apagando…' : 'Apagar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
