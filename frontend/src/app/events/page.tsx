'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import { StatusIndicator } from '../../components/atoms/StatusIndicator';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiUrl } from '../../lib/backend';

interface KubeEvent {
  name: string;
  namespace: string;
  reason: string;
  message: string;
  type: string;
  firstTimestamp: string;
  lastTimestamp: string;
  count: number;
  source: string;
}

export default function EventsPage() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [events, setEvents] = useState<KubeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = () => {
    if (!selectedContext || !selectedNamespace) return;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/events`))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch events');
        return res.json();
      })
      .then((data) => {
        // Sort events by lastTimestamp descending
        const sorted = (data || []).sort(
          (a: KubeEvent, b: KubeEvent) =>
            new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
        );
        setEvents(sorted);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Failed to load events');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvents();
    // Refresh every 30s to reduce backend pressure
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [selectedContext, selectedNamespace]);

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
              API Events
            </Typography>
            <Typography variant="body" className="text-on-surface-variant text-sm mt-1">
              Real-time cluster activity for namespace <span className="text-primary font-medium">{selectedNamespace}</span>
            </Typography>
          </div>
          <button 
            onClick={fetchEvents}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-white/5 text-on-surface text-sm transition-colors"
          >
            <RefreshIcon fontSize="small" className={loading ? 'animate-spin text-primary' : 'text-outline'} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 glass-panel rounded-xl overflow-hidden flex flex-col">
          {loading && events.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent animate-spin" />
              <Typography variant="body" className="text-outline">Loading cluster events...</Typography>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-error">
              <ErrorIcon fontSize="large" />
              <Typography variant="body" className="text-on-surface-variant">{error}</Typography>
            </div>
          ) : events.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-outline">
              <InfoIcon fontSize="large" />
              <Typography variant="body">No recent events found in this namespace.</Typography>
            </div>
          ) : (
            <div className="flex-1 overflow-auto terminal-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-surface-container-low/60 text-outline text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Reason</th>
                    <th className="px-6 py-4">Message</th>
                    <th className="px-6 py-4">Source</th>
                    <th className="px-6 py-4 text-center">Count</th>
                    <th className="px-6 py-4 text-right">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {events.map((evt, idx) => {
                    const isWarning = evt.type === 'Warning';
                    return (
                      <tr key={idx} className="hover:bg-surface-container/20 transition-colors text-sm">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            isWarning 
                              ? 'bg-error-container/20 text-error border border-error-container/40' 
                              : 'bg-primary-container/10 text-primary-fixed border border-primary-container/20'
                          }`}>
                            {evt.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-on-surface">
                          {evt.reason}
                        </td>
                        <td className="px-6 py-4 text-on-surface-variant max-w-md truncate" title={evt.message}>
                          {evt.message}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-outline">
                          {evt.source}
                        </td>
                        <td className="px-6 py-4 text-center text-on-surface font-mono">
                          {evt.count}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap text-outline text-xs">
                          {new Date(evt.lastTimestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
