'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorIcon from '@mui/icons-material/Error';
import SecurityIcon from '@mui/icons-material/Security';

interface Role {
  name: string;
  namespace: string;
  rulesCount: number;
}

interface RoleBinding {
  name: string;
  namespace: string;
  roleRef: string;
  subjectsCount: number;
}

interface ClusterRole {
  name: string;
  rulesCount: number;
}

interface RbacData {
  roles: Role[];
  roleBindings: RoleBinding[];
  clusterRoles: ClusterRole[];
}

export default function RbacPage() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [data, setData] = useState<RbacData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'roles' | 'bindings' | 'clusterRoles'>('roles');

  const fetchRbac = () => {
    if (!selectedContext || !selectedNamespace) return;
    setLoading(true);
    setError(null);
    fetch(`http://localhost:3001/api/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/rbac`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch RBAC data');
        return res.json();
      })
      .then((rbacData) => {
        setData(rbacData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Failed to load RBAC data');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRbac();
  }, [selectedContext, selectedNamespace]);

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
              Access Control (RBAC)
            </Typography>
            <Typography variant="body" className="text-on-surface-variant text-sm mt-1">
              Role permissions and authorization bindings for <span className="text-primary font-medium">{selectedNamespace}</span>
            </Typography>
          </div>
          <button 
            onClick={fetchRbac}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-white/5 text-on-surface text-sm transition-colors"
          >
            <RefreshIcon fontSize="small" className={loading ? 'animate-spin text-primary' : 'text-outline'} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-white/5 mb-6 space-x-6">
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 relative ${
              activeTab === 'roles' 
                ? 'text-primary border-primary' 
                : 'text-outline-variant border-transparent hover:text-on-surface'
            }`}
          >
            Roles ({data?.roles?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('bindings')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 relative ${
              activeTab === 'bindings' 
                ? 'text-primary border-primary' 
                : 'text-outline-variant border-transparent hover:text-on-surface'
            }`}
          >
            Role Bindings ({data?.roleBindings?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('clusterRoles')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 relative ${
              activeTab === 'clusterRoles' 
                ? 'text-primary border-primary' 
                : 'text-outline-variant border-transparent hover:text-on-surface'
            }`}
          >
            Cluster Roles ({data?.clusterRoles?.length || 0})
          </button>
        </div>

        {/* Content Card */}
        <div className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
              <Typography variant="body" className="text-outline">Querying RBAC policies...</Typography>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-error">
              <ErrorIcon fontSize="large" />
              <Typography variant="body" className="text-on-surface-variant">{error}</Typography>
            </div>
          ) : !data ? (
            <div className="flex-1 flex items-center justify-center text-outline">
              No RBAC data loaded.
            </div>
          ) : (
            <div className="flex-1 overflow-auto terminal-scroll">
              {activeTab === 'roles' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-low/60 text-outline text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Namespace</th>
                      <th className="px-6 py-4 text-right">Rules Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.roles.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-outline">
                          No namespaced Roles found.
                        </td>
                      </tr>
                    ) : (
                      data.roles.map((role, idx) => (
                        <tr key={idx} className="hover:bg-surface-container/20 transition-colors text-sm">
                          <td className="px-6 py-4 font-mono font-medium text-on-surface flex items-center space-x-2">
                            <SecurityIcon className="text-outline-variant" fontSize="small" />
                            <span>{role.name}</span>
                          </td>
                          <td className="px-6 py-4 text-outline">{role.namespace}</td>
                          <td className="px-6 py-4 text-right text-primary font-semibold">{role.rulesCount} rules</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'bindings' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-low/60 text-outline text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Role Reference</th>
                      <th className="px-6 py-4 text-right">Subjects Bound</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.roleBindings.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-outline">
                          No namespaced RoleBindings found.
                        </td>
                      </tr>
                    ) : (
                      data.roleBindings.map((binding, idx) => (
                        <tr key={idx} className="hover:bg-surface-container/20 transition-colors text-sm">
                          <td className="px-6 py-4 font-mono font-medium text-on-surface flex items-center space-x-2">
                            <SecurityIcon className="text-outline-variant" fontSize="small" />
                            <span>{binding.name}</span>
                          </td>
                          <td className="px-6 py-4 text-primary-fixed font-mono text-xs">{binding.roleRef}</td>
                          <td className="px-6 py-4 text-right text-outline">{binding.subjectsCount} subjects</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'clusterRoles' && (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-surface-container-low/60 text-outline text-xs font-semibold uppercase tracking-wider">
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4 text-right">Rules Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.clusterRoles.map((cr, idx) => (
                      <tr key={idx} className="hover:bg-surface-container/20 transition-colors text-sm">
                        <td className="px-6 py-4 font-mono font-medium text-on-surface flex items-center space-x-2">
                          <SecurityIcon className="text-primary-container" fontSize="small" />
                          <span>{cr.name}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-primary font-semibold">{cr.rulesCount} rules</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
