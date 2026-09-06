import { Bell, Camera } from 'lucide-react';

/**
 * Header superior. Recebe o título da página (definido por cada página via
 * um pequeno hook/contexto seria ideal futuramente; por ora, cada página
 * pode passar via prop no App.jsx com base na rota, mantendo simples).
 */
export default function Topbar({ title, breadcrumb, instagramConnected, hasAlert }) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {breadcrumb && <div className="topbar-breadcrumb">{breadcrumb}</div>}
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        <span className="topbar-pill">
          <Camera size={13} />
          {instagramConnected ? 'Conectado' : 'Desconectado'}
        </span>

        <button className="topbar-icon-btn" title="Notificações" aria-label="Notificações">
          <Bell size={17} />
          {hasAlert && <span className="ping" />}
        </button>

        <div className="topbar-avatar" title="Conta local">RM</div>
      </div>
    </header>
  );
}
