'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../lib/backend';

export type KubeContextType = { name: string; cluster?: string; user?: string };
export type KubeNamespaceType = { name: string };

interface KubeGlobalContextType {
  contexts: KubeContextType[];
  namespaces: KubeNamespaceType[];
  selectedContext: string;
  selectedNamespace: string;
  setSelectedContext: (context: string) => void;
  setSelectedNamespace: (namespace: string) => void;
  loadingContexts: boolean;
  loadingNamespaces: boolean;
}

const KubeGlobalContext = createContext<KubeGlobalContextType | undefined>(undefined);

let cachedContexts: KubeContextType[] | null = null;
const cachedNamespacesByContext = new Map<string, KubeNamespaceType[]>();

export const KubeGlobalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contexts, setContexts] = useState<KubeContextType[]>([]);
  const [namespaces, setNamespaces] = useState<KubeNamespaceType[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');
  const [loadingContexts, setLoadingContexts] = useState(true);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);

  useEffect(() => {
    if (cachedContexts) {
      setContexts(cachedContexts);
      if (cachedContexts.length > 0) {
        setSelectedContext(cachedContexts[0].name);
      }
      setLoadingContexts(false);
      return;
    }

    setLoadingContexts(true);
    fetch(apiUrl('/api/kube/contexts'))
      .then((res) => res.json())
      .then((data) => {
        setLoadingContexts(false);
        if (data && data.length > 0) {
          setContexts(data);
          cachedContexts = data;
          const initialContext = data[0].name;
          setSelectedContext(initialContext);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch contexts', err);
        setLoadingContexts(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedContext) return;

    const cachedNamespaces = cachedNamespacesByContext.get(selectedContext);
    if (cachedNamespaces) {
      setNamespaces(cachedNamespaces);
      const defaultNs = cachedNamespaces.find((ns: KubeNamespaceType) => ns.name === 'default') || cachedNamespaces[0];
      setSelectedNamespace(defaultNs?.name || '');
      setLoadingNamespaces(false);
      return;
    }

    setLoadingNamespaces(true);
    fetch(apiUrl(`/api/kube/contexts/${selectedContext}/namespaces`))
      .then((res) => res.json())
      .then((data) => {
        setLoadingNamespaces(false);
        if (data && data.length > 0) {
          setNamespaces(data);
          cachedNamespacesByContext.set(selectedContext, data);
          // Try to select 'default' if it exists, otherwise the first one
          const defaultNs = data.find((ns: KubeNamespaceType) => ns.name === 'default') || data[0];
          setSelectedNamespace(defaultNs.name);
        } else {
          setNamespaces([]);
          setSelectedNamespace('');
        }
      })
      .catch((err) => {
        console.error('Failed to fetch namespaces', err);
        setLoadingNamespaces(false);
      });
  }, [selectedContext]);

  return (
    <KubeGlobalContext.Provider
      value={{
        contexts,
        namespaces,
        selectedContext,
        selectedNamespace,
        setSelectedContext,
        setSelectedNamespace,
        loadingContexts,
        loadingNamespaces,
      }}
    >
      {children}
    </KubeGlobalContext.Provider>
  );
};

export const useKubeGlobal = () => {
  const context = useContext(KubeGlobalContext);
  if (!context) {
    throw new Error('useKubeGlobal must be used within a KubeGlobalProvider');
  }
  return context;
};
