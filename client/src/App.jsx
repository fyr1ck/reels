import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Queue from './pages/Queue.jsx';
import ReelEditor from './pages/ReelEditor.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import InstagramPage from './pages/InstagramPage.jsx';
import Analytics from './pages/Analytics.jsx';
import History from './pages/History.jsx';
import Logs from './pages/Logs.jsx';
import Settings from './pages/Settings.jsx';
import Operacao from './pages/Operacao.jsx';
import Biblioteca from './pages/Biblioteca.jsx';
import Pastas from './pages/Pastas.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { api } from './api/client.js';

const PAGE_META = {
  '/': { title: 'Dashboard', breadcrumb: 'Visão geral' },
  '/operacao': { title: 'Operação', breadcrumb: 'Visão geral' },
  '/fila': { title: 'Fila de vídeos', breadcrumb: 'Conteúdo' },
  '/editor-em-massa': { title: 'Editor em Massa', breadcrumb: 'Conteúdo' },
  '/calendario': { title: 'Calendário', breadcrumb: 'Conteúdo' },
  '/horarios': { title: 'Horários', breadcrumb: 'Conteúdo' },
  '/biblioteca': { title: 'Legendas & Hashtags', breadcrumb: 'Conteúdo' },
  '/pastas': { title: 'Pastas monitoradas', breadcrumb: 'Conteúdo' },
  '/instagram': { title: 'Instagram', breadcrumb: 'Conta / Conexão' },
  '/analytics': { title: 'Analytics', breadcrumb: 'Instagram' },
  '/historico': { title: 'Histórico', breadcrumb: 'Atividade' },
  '/logs': { title: 'Logs', breadcrumb: 'Atividade' },
  '/configuracoes': { title: 'Configurações', breadcrumb: 'Sistema' },
};

function Shell() {
  const location = useLocation();
  const [automationStatus, setAutomationStatus] = useState(null);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [interventionPending, setInterventionPending] = useState(false);

  const loadTopLevelStatus = useCallback(async () => {
    try {
      const [{ data: automation }, { data: instagram }] = await Promise.all([
        api.get('/automation/status'),
        api.get('/instagram/status'),
      ]);
      setAutomationStatus(automation.automationStatus);
      setInterventionPending(!!automation.interventionPending);
      setInstagramConnected(!!instagram.connected);
    } catch {
      // silencioso — cada página trata seus próprios erros de carregamento
    }
  }, []);

  useEffect(() => {
    loadTopLevelStatus();
    const t = setInterval(loadTopLevelStatus, 8000);
    return () => clearInterval(t);
  }, [loadTopLevelStatus]);

  const meta = PAGE_META[location.pathname] || { title: 'Reels Manager' };

  return (
    <div className="app-shell">
      <Sidebar automationStatus={automationStatus} />
      <div className="app-main-col">
        <Topbar
          title={meta.title}
          breadcrumb={meta.breadcrumb}
          instagramConnected={instagramConnected}
          hasAlert={interventionPending}
        />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/operacao" element={<Operacao />} />
            <Route path="/fila" element={<Queue />} />
            <Route path="/editor-em-massa" element={<ReelEditor />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/horarios" element={<SchedulePage />} />
            <Route path="/biblioteca" element={<Biblioteca />} />
            <Route path="/pastas" element={<Pastas />} />
            <Route path="/instagram" element={<InstagramPage />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/historico" element={<History />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/configuracoes" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  );
}
