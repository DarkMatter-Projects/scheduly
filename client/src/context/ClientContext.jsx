import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listClients } from '../api/clientsApi';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'scheduly:activeClientId';

const ClientContext = createContext(null);

export function ClientProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [activeClientId, setActiveClientIdState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
    enabled: isAuthenticated,
  });

  // If the active client gets deleted elsewhere, fall back to "All clients"
  useEffect(() => {
    if (activeClientId == null) return;
    if (isLoading) return;
    if (!clients.some(c => c.id === activeClientId)) {
      setActiveClientIdState(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeClientId, clients, isLoading]);

  const setActiveClientId = (id) => {
    if (id == null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
    setActiveClientIdState(id ?? null);
  };

  const activeClient = useMemo(
    () => clients.find(c => c.id === activeClientId) || null,
    [clients, activeClientId]
  );

  const value = useMemo(() => ({
    clients,
    activeClientId,
    activeClient,
    setActiveClientId,
  }), [clients, activeClientId, activeClient]);

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClientScope() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClientScope must be used within ClientProvider');
  return ctx;
}
