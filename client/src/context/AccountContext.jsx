import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AccountContext = createContext(null);

const STORAGE_KEY = 'rm.selectedAccountId';

/**
 * Conta selecionada no seletor do topo da sidebar, compartilhada entre as
 * telas. A escolha fica no localStorage para sobreviver ao reload — mas a
 * conta só é considerada válida se ainda existir na lista vinda do servidor
 * (uma conta removida em outra aba não pode deixar a interface travada).
 */
export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/accounts');
      setAccounts(data);

      setSelectedId((current) => {
        if (current && data.some((a) => a.id === current)) return current;
        const fallback = data.find((a) => a.isDefault) || data[0];
        return fallback ? fallback.id : null;
      });
    } catch {
      // silencioso — cada tela mostra seu próprio estado de erro
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(STORAGE_KEY, selectedId);
  }, [selectedId]);

  const value = useMemo(
    () => ({
      accounts,
      loading,
      selectedId,
      selectAccount: setSelectedId,
      selected: accounts.find((a) => a.id === selectedId) || null,
      reload,
    }),
    [accounts, loading, selectedId, reload]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccounts() {
  const ctx = useContext(AccountContext);
  if (!ctx) {
    throw new Error('useAccounts precisa ser usado dentro de <AccountProvider>. Verifique o App.jsx.');
  }
  return ctx;
}
