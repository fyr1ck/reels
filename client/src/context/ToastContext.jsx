import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const show = useCallback((message, type = 'info', durationMs = 4500) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), durationMs);
    return id;
  }, [dismiss]);

  const toast = {
    success: (msg, ms) => show(msg, 'success', ms),
    error: (msg, ms) => show(msg, 'error', ms ?? 6000),
    warning: (msg, ms) => show(msg, 'warning', ms),
    info: (msg, ms) => show(msg, 'info', ms),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-viewport">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span className="icon"><Icon size={17} /></span>
              <div className="body">{t.message}</div>
              <span className="close" onClick={() => dismiss(t.id)}>
                <X size={15} />
              </span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast precisa ser usado dentro de <ToastProvider>. Verifique se o App.jsx está envolvido pelo provider.');
  }
  return ctx;
}
