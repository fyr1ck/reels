import { useRef } from 'react';
import { User, Type, Video, Image as ImageIcon, Stamp, Volume2, Download } from 'lucide-react';
import { api } from '../../api/client.js';
import { FIT_OPTIONS, BACKGROUND_OPTIONS, QUALITY_LABELS } from './constants.js';

function Field({ label, value, children }) {
  return (
    <div className="re-field">
      <label>{label}{value !== undefined && <span className="val">{value}</span>}</label>
      {children}
    </div>
  );
}

function ImageUploadField({ label, value, onChange, onClear }) {
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('asset', file);
    const { data } = await api.post('/reel-editor/assets/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    onChange(data.filename);
  }

  return (
    <div className="re-field">
      <label>{label}</label>
      <div className="re-image-upload">
        <div className="re-thumb">
          {value ? <img src={`/api/reel-editor/assets/${value}`} alt="" /> : <ImageIcon size={18} />}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleFile} />
        <button className="btn btn-sm" onClick={() => inputRef.current?.click()}>{value ? 'Trocar' : 'Enviar imagem'}</button>
        {value && <button className="btn btn-sm btn-danger" onClick={onClear}>Remover</button>}
      </div>
    </div>
  );
}

export default function TemplateSettingsPanel({ config, onChange }) {
  function set(section, patch) {
    onChange({ ...config, [section]: { ...config[section], ...patch } });
  }

  const { profile, title, videoContainer, background, watermark, audio, export: exportCfg } = config;

  return (
    <div className="re-panel">
      {/* PERFIL */}
      <details className="re-section" open>
        <summary><User size={15} /> Perfil</summary>
        <div className="re-body">
          <ImageUploadField label="Foto de perfil" value={profile.photoUrl} onChange={(v) => set('profile', { photoUrl: v })} onClear={() => set('profile', { photoUrl: null })} />
          <Field label="Nome">
            <input type="text" value={profile.name} onChange={(e) => set('profile', { name: e.target.value })} />
          </Field>
          <Field label="Username">
            <input type="text" value={profile.username} onChange={(e) => set('profile', { username: e.target.value })} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={profile.verified} onChange={(e) => set('profile', { verified: e.target.checked })} />
            Verificado (selo azul)
          </label>
          <div className="re-row2">
            <Field label="Tamanho da foto" value={`${profile.avatarSize}px`}>
              <input type="range" min={32} max={120} value={profile.avatarSize} onChange={(e) => set('profile', { avatarSize: +e.target.value })} />
            </Field>
            <Field label="Tamanho do texto" value={`${profile.fontSize}px`}>
              <input type="range" min={16} max={48} value={profile.fontSize} onChange={(e) => set('profile', { fontSize: +e.target.value })} />
            </Field>
          </div>
          <div className="re-row2">
            <Field label="Posição X" value={profile.posX}>
              <input type="range" min={0} max={800} value={profile.posX} onChange={(e) => set('profile', { posX: +e.target.value })} />
            </Field>
            <Field label="Posição Y" value={profile.posY}>
              <input type="range" min={0} max={1000} value={profile.posY} onChange={(e) => set('profile', { posY: +e.target.value })} />
            </Field>
          </div>
        </div>
      </details>

      {/* TÍTULO */}
      <details className="re-section" open>
        <summary><Type size={15} /> Título</summary>
        <div className="re-body">
          <Field label="Texto">
            <textarea value={title.text} onChange={(e) => set('title', { text: e.target.value })} />
          </Field>
          <div className="re-row2">
            <Field label="Tamanho" value={`${title.fontSize}px`}>
              <input type="range" min={16} max={64} value={title.fontSize} onChange={(e) => set('title', { fontSize: +e.target.value })} />
            </Field>
            <Field label="Peso">
              <select value={title.fontWeight} onChange={(e) => set('title', { fontWeight: +e.target.value })}>
                <option value={400}>Normal</option>
                <option value={600}>Semi-negrito</option>
                <option value={700}>Negrito</option>
                <option value={800}>Extra-negrito</option>
              </select>
            </Field>
          </div>
          <div className="re-row2">
            <Field label="Alinhamento">
              <select value={title.align} onChange={(e) => set('title', { align: e.target.value })}>
                <option value="left">Esquerda</option>
                <option value="center">Centro</option>
                <option value="right">Direita</option>
              </select>
            </Field>
            <Field label="Cor">
              <input type="color" value={title.color} onChange={(e) => set('title', { color: e.target.value })} />
            </Field>
          </div>
          <div className="re-row2">
            <Field label="Posição X" value={title.posX}>
              <input type="range" min={0} max={800} value={title.posX} onChange={(e) => set('title', { posX: +e.target.value })} />
            </Field>
            <Field label="Posição Y" value={title.posY}>
              <input type="range" min={0} max={1200} value={title.posY} onChange={(e) => set('title', { posY: +e.target.value })} />
            </Field>
          </div>
          <Field label="Largura da caixa de texto" value={`${title.width}px`}>
            <input type="range" min={200} max={1080} value={title.width} onChange={(e) => set('title', { width: +e.target.value })} />
          </Field>
          <div className="text-faint" style={{ fontSize: 11 }}>{title.text.length} caracteres — o texto se ajusta automaticamente à largura definida.</div>
        </div>
      </details>

      {/* ÁREA DO VÍDEO */}
      <details className="re-section" open>
        <summary><Video size={15} /> Área do vídeo</summary>
        <div className="re-body">
          <div className="re-radio-group">
            {FIT_OPTIONS.map((opt) => (
              <label key={opt.value} className={`re-radio${videoContainer.fit === opt.value ? ' active' : ''}`}>
                <input type="radio" name="fit" checked={videoContainer.fit === opt.value} onChange={() => set('videoContainer', { fit: opt.value })} />
                <span>
                  {opt.label}
                  <span className="re-radio-desc">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="re-row2">
            <Field label="Largura" value={`${videoContainer.width}px`}>
              <input type="range" min={200} max={1080} value={videoContainer.width} onChange={(e) => set('videoContainer', { width: +e.target.value })} />
            </Field>
            <Field label="Altura" value={`${videoContainer.height}px`}>
              <input type="range" min={200} max={1920} value={videoContainer.height} onChange={(e) => set('videoContainer', { height: +e.target.value })} />
            </Field>
          </div>
          <div className="re-row2">
            <Field label="Posição X" value={videoContainer.x}>
              <input type="range" min={0} max={880} value={videoContainer.x} onChange={(e) => set('videoContainer', { x: +e.target.value })} />
            </Field>
            <Field label="Posição Y" value={videoContainer.y}>
              <input type="range" min={0} max={1720} value={videoContainer.y} onChange={(e) => set('videoContainer', { y: +e.target.value })} />
            </Field>
          </div>
          <Field label="Borda arredondada" value={`${videoContainer.borderRadius}px`}>
            <input type="range" min={0} max={80} value={videoContainer.borderRadius} onChange={(e) => set('videoContainer', { borderRadius: +e.target.value })} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={videoContainer.shadowEnabled} onChange={(e) => set('videoContainer', { shadowEnabled: e.target.checked })} />
            Sombra
          </label>
          {videoContainer.shadowEnabled && (
            <div className="re-row2">
              <Field label="Intensidade (blur)" value={videoContainer.shadowBlur}>
                <input type="range" min={0} max={80} value={videoContainer.shadowBlur} onChange={(e) => set('videoContainer', { shadowBlur: +e.target.value })} />
              </Field>
              <Field label="Opacidade" value={videoContainer.shadowOpacity.toFixed(2)}>
                <input type="range" min={0} max={1} step={0.05} value={videoContainer.shadowOpacity} onChange={(e) => set('videoContainer', { shadowOpacity: +e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </details>

      {/* FUNDO */}
      <details className="re-section">
        <summary><ImageIcon size={15} /> Fundo</summary>
        <div className="re-body">
          <Field label="Tipo">
            <select value={background.type} onChange={(e) => set('background', { type: e.target.value })}>
              {BACKGROUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {background.type === 'color' && (
            <Field label="Cor">
              <input type="color" value={background.color} onChange={(e) => set('background', { color: e.target.value })} />
            </Field>
          )}
          {background.type === 'gradient' && (
            <>
              <div className="re-row2">
                <Field label="Cor inicial">
                  <input type="color" value={background.gradientFrom} onChange={(e) => set('background', { gradientFrom: e.target.value })} />
                </Field>
                <Field label="Cor final">
                  <input type="color" value={background.gradientTo} onChange={(e) => set('background', { gradientTo: e.target.value })} />
                </Field>
              </div>
              <Field label="Ângulo" value={`${background.gradientAngle}°`}>
                <input type="range" min={0} max={360} value={background.gradientAngle} onChange={(e) => set('background', { gradientAngle: +e.target.value })} />
              </Field>
            </>
          )}
          {background.type === 'image' && (
            <ImageUploadField label="Imagem de fundo" value={background.imageUrl} onChange={(v) => set('background', { imageUrl: v })} onClear={() => set('background', { imageUrl: null })} />
          )}
          {background.type === 'blurred' && (
            <div className="text-faint" style={{ fontSize: 11.5 }}>Uma cópia desfocada e escurecida do próprio vídeo preenche toda a tela atrás dele.</div>
          )}
        </div>
      </details>

      {/* MARCA D'ÁGUA */}
      <details className="re-section">
        <summary><Stamp size={15} /> Marca d'água</summary>
        <div className="re-body">
          <label className="checkbox-row">
            <input type="checkbox" checked={watermark.enabled} onChange={(e) => set('watermark', { enabled: e.target.checked })} />
            Ativar marca d'água / logo
          </label>
          {watermark.enabled && (
            <>
              <ImageUploadField label="Logo" value={watermark.logoUrl} onChange={(v) => set('watermark', { logoUrl: v })} onClear={() => set('watermark', { logoUrl: null })} />
              <div className="re-corner-grid">
                {[
                  ['top-left', 'Superior esquerdo'], ['top-right', 'Superior direito'],
                  ['bottom-left', 'Inferior esquerdo'], ['bottom-right', 'Inferior direito'],
                ].map(([val, label]) => (
                  <button key={val} className={`re-corner-btn${watermark.position === val ? ' active' : ''}`} onClick={() => set('watermark', { position: val })}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="re-row2">
                <Field label="Opacidade" value={`${Math.round(watermark.opacity * 100)}%`}>
                  <input type="range" min={0} max={1} step={0.05} value={watermark.opacity} onChange={(e) => set('watermark', { opacity: +e.target.value })} />
                </Field>
                <Field label="Tamanho" value={`${watermark.size}px`}>
                  <input type="range" min={30} max={220} value={watermark.size} onChange={(e) => set('watermark', { size: +e.target.value })} />
                </Field>
              </div>
            </>
          )}
        </div>
      </details>

      {/* ÁUDIO */}
      <details className="re-section">
        <summary><Volume2 size={15} /> Áudio</summary>
        <div className="re-body">
          <label className="checkbox-row">
            <input type="checkbox" checked={audio.preserveOriginal} onChange={(e) => onChange({ ...config, audio: { preserveOriginal: e.target.checked } })} />
            Preservar áudio original
          </label>
        </div>
      </details>

      {/* EXPORTAÇÃO */}
      <details className="re-section">
        <summary><Download size={15} /> Exportação</summary>
        <div className="re-body">
          <Field label="Qualidade">
            <select value={exportCfg.quality} onChange={(e) => onChange({ ...config, export: { ...exportCfg, quality: e.target.value } })}>
              {Object.entries(QUALITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Padrão do nome do arquivo">
            <input
              type="text"
              value={exportCfg.filenamePattern}
              onChange={(e) => onChange({ ...config, export: { ...exportCfg, filenamePattern: e.target.value } })}
            />
          </Field>
          <div className="text-faint" style={{ fontSize: 11 }}>Use <code>{'{name}'}</code> para o nome original e <code>{'{template}'}</code> para o nome do template. Formato de saída: 1080×1920, MP4, H.264.</div>
        </div>
      </details>
    </div>
  );
}
