'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Subscription {
  id: string;
  name: string;
}

interface Cluster {
  id: string;
  name: string;
  resourceGroup: string;
}

interface Namespace {
  name: string;
}

interface Selection {
  selectedSub: string;
  selectedCluster: string;
  selectedNamespace: string;
}

export default function ClusterSelector({ onSelectionChange }: { onSelectionChange: (selection: Selection) => void }) {
  const { data: session } = useSession();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);

  const [selectedSub, setSelectedSub] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [selectedNamespace, setSelectedNamespace] = useState('');

  // Use the mocked data for now, but in reality we would use the token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (session as any)?.accessToken || 'mock-token';

  useEffect(() => {
    if (session) {
      fetch('http://localhost:3001/api/azure/subscriptions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(setSubscriptions)
      .catch(console.error);
    }
  }, [session, token]);

  useEffect(() => {
    if (selectedSub) {
      fetch(`http://localhost:3001/api/azure/subscriptions/${selectedSub}/clusters`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(setClusters)
      .catch(console.error);
    }
  }, [selectedSub, token]);

  useEffect(() => {
    if (selectedSub && selectedCluster) {
      const cluster = clusters.find(c => c.id === selectedCluster);
      if (cluster) {
        fetch(`http://localhost:3001/api/azure/subscriptions/${selectedSub}/resourceGroups/${cluster.resourceGroup}/clusters/${cluster.name}/namespaces`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(setNamespaces)
        .catch(console.error);
      }
    }
  }, [selectedCluster, selectedSub, clusters, token]);

  useEffect(() => {
    onSelectionChange({ selectedSub, selectedCluster, selectedNamespace });
  }, [selectedSub, selectedCluster, selectedNamespace, onSelectionChange]);

  if (!session) return null;

  const handleSubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSub(e.target.value);
    setClusters([]);
    setSelectedCluster('');
    setNamespaces([]);
    setSelectedNamespace('');
  };

  const handleClusterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCluster(e.target.value);
    setNamespaces([]);
    setSelectedNamespace('');
  };

  return (
    <div style={{ display: 'flex', gap: '16px', padding: '16px', backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>
      <select 
        value={selectedSub} 
        onChange={handleSubChange}
        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
      >
        <option value="">Select Subscription</option>
        {subscriptions.map((sub) => (
          <option key={sub.id} value={sub.id}>{sub.name}</option>
        ))}
      </select>

      <select 
        value={selectedCluster} 
        onChange={handleClusterChange}
        disabled={!selectedSub}
        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
      >
        <option value="">Select AKS Cluster</option>
        {clusters.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select 
        value={selectedNamespace} 
        onChange={(e) => setSelectedNamespace(e.target.value)}
        disabled={!selectedCluster}
        style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
      >
        <option value="">Select Namespace</option>
        {namespaces.map((ns) => (
          <option key={ns.name} value={ns.name}>{ns.name}</option>
        ))}
      </select>
    </div>
  );
}
