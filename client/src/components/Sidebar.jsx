import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListVideo, CalendarDays, Clock, BarChart3,
  History, ScrollText, Settings, ChevronsLeft, ChevronsRight, Film, Camera, Wand2,
  Activity, Hash, FolderSync,
} from 'lucide-react';
import AutomationBadge from './AutomationBadge.jsx';

const NAV_GROUPS = [
  {
    label: null, // grupo sem título (Dashboard sozinho no topo)
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/operacao', label: 'Operação', icon: Activity },
    ],
  },
  {
    label: 'Conteúdo',
    items: [
      { to: '/fila', label: 'Fila de vídeos', icon: ListVideo },
      { to: '/editor-em-massa', label: 'Editor em Massa', icon: Wand2 },
      { to: '/calendario', label: 'Calendário', icon: CalendarDays },
      { to: '/horarios', label: 'Horários', icon: Clock },
      { to: '/biblioteca', label: 'Legendas & Hashtags', icon: Hash },
      { to: '/pastas', label: 'Pastas monitoradas', icon: FolderSync },
    ],
  },
  {
    label: 'Instagram',
    items: [
      { to: "/instagram", label: "Conta / Conexão", icon: Camera },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Atividade',
    items: [
      { to: '/historico', label: 'Histórico', icon: History },
      { to: '/logs', label: 'Logs', icon: ScrollText },
    ],
  },
  {
    label: 'Sistema',
    items: [{ to: '/configuracoes', label: 'Configurações', icon: Settings }],
  },
];

export default function Sidebar({ automationStatus }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('rm.sidebarCollapsed') === '1');

  useEffect(() => {
    localStorage.setItem('rm.sidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="logo-dot"><Film size={17} /></div>
        <div className="brand-text">
          <b>Reels Manager</b>
          <span>painel local</span>
        </div>
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>

      <nav className="nav-list">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && <div className="nav-group-label">{group.label}</div>}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="icon"><item.icon size={18} /></span>
                <span className="label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {automationStatus && (
          <div style={{ marginBottom: 10 }}>
            <AutomationBadge status={automationStatus} />
          </div>
        )}
        Publicação via automação de navegador (Playwright).<br />
        Nenhuma senha é armazenada.
      </div>
    </aside>
  );
}
