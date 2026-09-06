import { createContext, useCallback, useContext, useState } from 'react';

const ConfirmContext = createContext(null);

/**
 * Provider de confirmação, substituindo o confirm() nativo do navegador.
 * Uso: const confirmAction = useConfirm();
 *      const ok = await confirmAction({ title: 'Excluir vídeo?', description: '...', danger: true });
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, description, confirmLabel, cancelLabel, danger, resolve }

  const confirmAction = useCallback((options) => {
    return new Promise((resolve) => {
      setState({
        title: options?.title || 'Confirmar ação',
        description: options?.description || '',
        confirmLabel: options?.confirmLabel || 'Confirmar',
        cancelLabel: options?.cancelLabel || 'Cancelar',
        danger: !!options?.danger,
        resolve,
      });
    });
  }, []);

  function close(result) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      {state && (
        <div className="modal-overlay" role="alertdialog" aria-modal="true" onClick={() => close(false)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{state.title}</h3>
            {state.description && <p className="desc">{state.description}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => close(false)}>{state.cancelLabel}</button>
              <button
                className={state.danger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm precisa ser usado dentro de <ConfirmProvider>. Verifique se o App.jsx está envolvido pelo provider.');
  }
  return ctx;
}
