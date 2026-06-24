'use client';

import React, { useState, useEffect } from 'react';
import { apiUrl } from '../lib/backend';

interface KubeContext {
  name: string;
  cluster: string;
  user: string;
}

interface Namespace {
  name: string;
}

interface Selection {
  selectedContext: string;
  selectedNamespace: string;
}

export default function ClusterSelector({ onSelectionChange }: { onSelectionChange: (selection: Selection) => void }) {
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);

  const [selectedContext, setSelectedContext] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch(apiUrl('/api/kube/contexts'))
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to fetch contexts');
          return data;
        })
        .then(data => {
          if (Array.isArray(data)) setContexts(data);
          else setContexts([]);
        })
        .catch(err => {
          console.error(err);
          setErrorMsg(err.message);
        });
  }, []);

  useEffect(() => {
    if (selectedContext) {
      fetch(apiUrl(`/api/kube/contexts/${selectedContext}/namespaces`))
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Failed to fetch namespaces');
          return data;
        })
        .then(data => {
          if (Array.isArray(data)) {
            setNamespaces(data);
            setErrorMsg('');
          } else {
            setNamespaces([]);
          }
        })
        .catch(err => {
          console.error(err);
          setNamespaces([]);
          setErrorMsg(err.message);
        });
    }
  }, [selectedContext]);

  useEffect(() => {
    onSelectionChange({ selectedContext, selectedNamespace });
  }, [selectedContext, selectedNamespace, onSelectionChange]);

  const handleContextChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedContext(e.target.value);
    setNamespaces([]);
    setSelectedNamespace('');
    setErrorMsg('');
  };

  return (
    <div style={{ display: 'flex', gap: '16px', padding: '16px', backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>
      <select 
        value={selectedContext} 
        onChange={handleContextChange}
        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
      >
        <option value="">Select Kubeconfig Context</option>
        {contexts.length > 0 && contexts.map((ctx) => (
          <option key={ctx.name} value={ctx.name}>{ctx.name}</option>
        ))}
      </select>

      <select 
        value={selectedNamespace} 
        onChange={(e) => setSelectedNamespace(e.target.value)}
        disabled={!selectedContext}
        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
      >
        <option value="">Select Namespace</option>
        {namespaces.map((ns) => (
          <option key={ns.name} value={ns.name}>{ns.name}</option>
        ))}
      </select>
      
      {errorMsg && (
        <div style={{ color: '#ff4d4f', padding: '8px', fontSize: '14px', flex: 1, display: 'flex', alignItems: 'center' }}>
          Error: {errorMsg}
        </div>
      )}
    </div>
  );
}
