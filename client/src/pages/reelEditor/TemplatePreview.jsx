import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { CANVAS_W, CANVAS_H, computeContain, computeCover, computeWatermarkPosition } from './constants.js';

function assetUrl(filename) {
  if (!filename) return null;
  if (filename.startsWith('http') || filename.startsWith('/')) return filename;
  return `/api/reel-editor/assets/${filename}`;
}

function backgroundCss(background) {
  if (background.type === 'gradient') {
    return `linear-gradient(${background.gradientAngle ?? 180}deg, ${background.gradientFrom}, ${background.gradientTo})`;
  }
  if (background.type === 'color' || background.type === 'blurred') {
    return background.color || '#000000';
  }
  return '#000';
}

export default function TemplatePreview({ config, previewSrc, stageWidth = 300, showSafeArea = false }) {
  const scale = stageWidth / CANVAS_W;
  const stageHeight = CANVAS_H * scale;
  const videoRef = useRef(null);
  const [vidDims, setVidDims] = useState({ w: 0, h: 0 });
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => { setVidDims({ w: 0, h: 0 }); }, [previewSrc]);

  const { profile, title, videoContainer, background, watermark } = config;
  const cw = videoContainer.width;
  const ch = videoContainer.height;

  let fitBox = { width: cw, height: ch, offsetX: 0, offsetY: 0 };
  if (vidDims.w && vidDims.h) {
    fitBox = videoContainer.fit === 'cover'
      ? computeCover(vidDims.w, vidDims.h, cw, ch)
      : computeContain(vidDims.w, vidDims.h, cw, ch);
  }

  const wmPos = watermark.enabled
    ? computeWatermarkPosition(watermark.position, watermark.size, watermark.margin)
    : null;

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  return (
    <div className="re-preview-wrap">
      <div className="re-preview-stage" style={{ width: stageWidth, height: stageHeight }}>
        <div
          className="re-preview-canvas"
          style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})` }}
        >
          {/* Fundo de tela cheia */}
          <div
            className="re-c-bg"
            style={{
              background: backgroundCss(background),
              filter: background.type === 'blurred' ? 'blur(40px) brightness(0.7)' : undefined,
              overflow: 'hidden',
            }}
          >
            {background.type === 'image' && background.imageUrl && (
              <img src={assetUrl(background.imageUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {background.type === 'blurred' && previewSrc && (
              <video src={previewSrc} muted loop autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>

          {/* Sombra do container */}
          {videoContainer.shadowEnabled && (
            <div
              style={{
                position: 'absolute', left: videoContainer.x, top: videoContainer.y, width: cw, height: ch,
                borderRadius: videoContainer.borderRadius,
                boxShadow: `0 ${Math.round(videoContainer.shadowBlur / 2)}px ${videoContainer.shadowBlur}px rgba(0,0,0,${videoContainer.shadowOpacity})`,
              }}
            />
          )}

          {/* Container do vídeo — nunca corta no modo padrão (contain) */}
          <div
            className="re-c-video-container"
            style={{
              left: videoContainer.x, top: videoContainer.y, width: cw, height: ch,
              borderRadius: videoContainer.borderRadius,
              background: videoContainer.fit === 'blurred' ? '#000' : (background.type === 'blurred' ? 'transparent' : '#000'),
            }}
          >
            {videoContainer.fit === 'blurred' && previewSrc && (
              <video
                src={previewSrc} muted loop autoPlay playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(0.75)' }}
              />
            )}
            {previewSrc ? (
              <video
                ref={videoRef}
                src={previewSrc}
                muted={muted}
                loop
                playsInline
                onLoadedMetadata={(e) => setVidDims({ w: e.target.videoWidth, h: e.target.videoHeight })}
                style={{
                  left: fitBox.offsetX, top: fitBox.offsetY, width: fitBox.width, height: fitBox.height,
                  objectFit: videoContainer.fit === 'cover' ? 'cover' : 'contain',
                }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: 22 }}>
                Selecione um vídeo para pré-visualizar
              </div>
            )}
          </div>

          {/* Header: foto de perfil + nome + selo + username */}
          <div className="re-c-header" style={{ left: profile.posX, top: profile.posY }}>
            {profile.photoUrl ? (
              <img
                src={assetUrl(profile.photoUrl)}
                alt=""
                className="re-c-avatar"
                style={{ width: profile.avatarSize, height: profile.avatarSize }}
              />
            ) : (
              <div className="re-c-avatar" style={{ width: profile.avatarSize, height: profile.avatarSize }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: profile.fontSize, fontWeight: 750, color: '#0b0d12', lineHeight: 1.15 }}>
                <span>{profile.name}</span>
                {profile.verified && (
                  <svg width={Math.round(profile.fontSize * 0.72)} height={Math.round(profile.fontSize * 0.72)} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="11" fill="#3897f0" />
                    <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ fontSize: Math.round(profile.fontSize * 0.6), color: '#6b6f76', fontWeight: 500 }}>{profile.username}</div>
            </div>
          </div>

          {/* Título */}
          <div
            className="re-c-title"
            style={{
              left: title.posX, top: title.posY, width: title.width, fontSize: title.fontSize,
              fontWeight: title.fontWeight, color: title.color, textAlign: title.align, lineHeight: title.lineHeight,
            }}
          >
            {title.text}
          </div>

          {/* Marca d'água */}
          {watermark.enabled && watermark.logoUrl && wmPos && (
            <img
              className="re-c-watermark"
              src={assetUrl(watermark.logoUrl)}
              alt=""
              style={{ left: wmPos.x, top: wmPos.y, width: watermark.size, height: watermark.size, opacity: watermark.opacity }}
            />
          )}

          {/* Área segura (guia visual, não é exportada) */}
          {showSafeArea && (
            <div className="re-safe-outline" style={{ left: videoContainer.x, top: videoContainer.y, width: cw, height: ch }} />
          )}
        </div>
      </div>

      {previewSrc && (
        <div className="re-preview-controls">
          <button className="btn btn-icon btn-sm" onClick={togglePlay}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
          <button className="btn btn-icon btn-sm" onClick={toggleMute}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
          <span className="text-faint" style={{ fontSize: 11.5 }}>{CANVAS_W}×{CANVAS_H}</span>
        </div>
      )}
    </div>
  );
}
