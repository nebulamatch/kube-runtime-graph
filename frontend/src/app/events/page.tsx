'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ApiIcon from '@mui/icons-material/Api';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { apiUrl } from '../../lib/backend';

interface KubeEvent {
  id?: string;
  namespace: string;
  method?: string;
  path?: string;
  url?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  statusCode?: number;
  responseBody?: string;
  sourceIp?: string;
  destIp?: string;
  destPort?: number;
  sourceService?: string;
  destService?: string;
  sourcePod?: string;
  destPod?: string;
  durationMs?: number;
  timestamp?: string;
}

const isSystemServiceName = (name: string) => /^(kube-|coredns|konnectivity|metrics-server|prometheus|grafana|loki|kubernetes)$/i.test(name);
const isNoiseEndpoint = (value: string) => /metrics|prometheus|telemetry|health|ready|status/i.test(value);

const formatTime = (value?: string) => {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString();
};

const formatDuration = (value?: number) => {
  if (value === undefined || value === null) return '—';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
};

const statusBadge = (status?: number) => {
  if (!status) return 'bg-surface-container text-outline border-white/10';
  if (status >= 500) return 'bg-error/10 text-error border-error/20';
  if (status >= 400) return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
  if (status >= 300) return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
  return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
};

export default function EventsPage() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [events, setEvents] = useState<KubeEvent[]>([]);
  const [allEvents, setAllEvents] = useState<KubeEvent[]>([]);
  const [servicesList, setServicesList] = useState<string[]>([]);
  const [servicesOnly, setServicesOnly] = useState<boolean>(true);
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<KubeEvent | null>(null);

  const requestOrigin = (evt?: KubeEvent | null) => {
    if (!evt) return '-';
    const forwarded = evt.headers?.['x-forwarded-for'] || evt.headers?.['x-forwarded-host'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    const origin = evt.headers?.['origin'] || evt.headers?.['referer'];
    if (origin) return String(origin);
    return evt.sourceService || evt.sourcePod || evt.sourceIp || '-';
  };

  const statusLabel = (evt?: KubeEvent | null) => {
    if (!evt?.statusCode) return 'Request captured';
    return `${evt.statusCode}`;
  };

  const fetchEvents = () => {
    if (!selectedContext || !selectedNamespace) return;
    setLoading(true);
    setError(null);

    fetch(apiUrl(`/api/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/api-traces`))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch events');
        return res.json();
      })
      .then((data) => {
        const sorted = (data || []).sort((a: KubeEvent, b: KubeEvent) =>
          new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
        );

        setAllEvents(sorted);
        setEvents(sorted);

        const svcSet = new Set<string>();
        sorted.forEach((evt: KubeEvent) => {
          if (evt.sourceService && !isSystemServiceName(evt.sourceService)) svcSet.add(evt.sourceService);
          if (evt.destService && !isSystemServiceName(evt.destService)) svcSet.add(evt.destService);
        });
        setServicesList(Array.from(svcSet).sort());
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Failed to load events');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;

    fetchEvents();

    const interval = setInterval(() => {
      fetchEvents();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedContext, selectedNamespace]);

  useEffect(() => {
    let filtered = allEvents.slice();

    if (servicesOnly) {
      filtered = filtered.filter((e) => {
        const src = e.sourceService || '';
        const dst = e.destService || '';
        const endpoint = e.endpoint || e.url || e.path || '';
        const matchesKnownService = servicesList.length === 0 || servicesList.includes(src) || servicesList.includes(dst);
        const notSystemNoise = !isSystemServiceName(src) && !isSystemServiceName(dst);
        const notMetricsCall = !isNoiseEndpoint(endpoint);
        return matchesKnownService && notSystemNoise && notMetricsCall;
      });
    }

    if (serviceFilter) {
      filtered = filtered.filter((e) => e.destService === serviceFilter || e.sourceService === serviceFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => {
        if (!e.statusCode) return false;
        const bucket = Math.floor(e.statusCode / 100) * 100;
        return String(bucket) === statusFilter;
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((e) => {
        const searchable = [
          e.endpoint,
          e.url,
          e.path,
          e.sourcePod,
          e.destPod,
          e.sourceService,
          e.destService,
          e.sourceIp,
          e.destIp,
          e.method,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    setEvents(filtered);
  }, [allEvents, servicesOnly, serviceFilter, statusFilter, searchTerm, servicesList]);

  const stats = useMemo(() => {
    const total = events.length;
    const success = events.filter((e) => (e.statusCode || 0) >= 200 && (e.statusCode || 0) < 300).length;
    const errors = events.filter((e) => (e.statusCode || 0) >= 400).length;
    const uniqueServices = new Set(
      events.flatMap((e) => [e.sourceService, e.destService]).filter((s): s is string => !!s && !isSystemServiceName(s))
    ).size;
    const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
    return { total, successRate, errors, uniqueServices };
  }, [events]);

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden bg-linear-to-b from-surface to-surface-container-lowest">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ApiIcon className="text-primary" fontSize="small" />
              <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
                API Events
              </Typography>
            </div>
            <Typography variant="body" className="text-on-surface-variant text-sm">
              Service-to-service calls in namespace <span className="text-primary font-medium">{selectedNamespace}</span>
            </Typography>
          </div>

          <button
            onClick={fetchEvents}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high border border-white/8 text-on-surface text-sm transition-colors shadow-lg shadow-black/20"
          >
            <RefreshIcon fontSize="small" className={loading ? 'animate-spin text-primary' : 'text-outline'} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Calls', value: stats.total },
            { label: 'Success Rate', value: `${stats.successRate}%` },
            { label: 'Services Seen', value: stats.uniqueServices },
            { label: 'Errors', value: stats.errors },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/6 bg-surface-container/60 px-4 py-3 shadow-lg shadow-black/10">
              <div className="text-[11px] uppercase tracking-[0.24em] text-outline mb-1">{item.label}</div>
              <div className="text-2xl font-semibold text-on-surface">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4 rounded-2xl border border-white/6 bg-surface-container-low/75 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-on-surface-variant text-sm whitespace-nowrap">
            <FilterAltIcon fontSize="small" />
            <span>Filters</span>
          </div>

          <label className="flex items-center gap-2 text-sm text-on-surface-variant whitespace-nowrap">
            <input
              type="checkbox"
              checked={servicesOnly}
              onChange={(e) => setServicesOnly(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-surface-container"
            />
            Service calls only
          </label>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="min-w-45 rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none border border-white/6"
          >
            <option value="">All services</option>
            {servicesList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-30 rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none border border-white/6"
          >
            <option value="all">All status</option>
            <option value="200">2xx</option>
            <option value="300">3xx</option>
            <option value="400">4xx</option>
            <option value="500">5xx</option>
          </select>

          <div className="relative flex-1">
            <SearchIcon fontSize="small" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search pod, service, endpoint, IP..."
              className="w-full rounded-xl bg-surface-container px-10 py-2 text-sm text-on-surface outline-none border border-white/6"
            />
          </div>
        </div>

        <div className="flex-1 rounded-3xl overflow-hidden border border-white/6 bg-[#181a20] shadow-2xl shadow-black/30">
          {loading && events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-outline">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <Typography variant="body">Loading API traces...</Typography>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-error">
              <ErrorIcon fontSize="large" />
              <Typography variant="body" className="text-on-surface-variant">
                {error}
              </Typography>
            </div>
          ) : events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-outline">
              <InfoIcon fontSize="large" />
              <Typography variant="body">No service API traces found in this namespace yet.</Typography>
            </div>
          ) : (
            <div className="h-full overflow-auto terminal-scroll">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#2b2f35] text-[#aeb4bd] text-[11px] uppercase tracking-[0.18em] border-b border-white/6">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3 min-w-80">Origin Chain</th>
                    <th className="px-4 py-3 text-center">Method</th>
                    <th className="px-4 py-3">Path</th>
                    <th className="px-4 py-3 text-center">Status Code</th>
                    <th className="px-4 py-3 text-center">Duration</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => {
                    const endpoint = evt.endpoint || evt.url || evt.path || '-';
                    const method = evt.method || 'TRACE';
                    const status = evt.statusCode;
                    const sourceLabel = evt.sourcePod || evt.sourceService || evt.sourceIp || '-';
                    const destLabel = evt.destPod || evt.destService || evt.destIp || '-';
                    return (
                      <tr key={evt.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-[11px] text-[#b4bac4] whitespace-nowrap font-mono">{formatTime(evt.timestamp)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-mono text-xs text-on-surface truncate">
                            {requestOrigin(evt) !== sourceLabel && (
                              <>
                                <span className="text-primary/70 font-semibold">{requestOrigin(evt)}</span>
                                <span className="text-outline-variant">→</span>
                              </>
                            )}
                            <span className="text-emerald-400/90">{sourceLabel}</span>
                            <span className="text-outline-variant">→</span>
                            <span className="text-amber-400/90">{destLabel}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center rounded-md border border-[#f0b44c]/25 bg-[#f0b44c]/10 px-2.5 py-1 text-[11px] font-semibold text-[#f0b44c]">
                            {method}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-70">
                          <div className="font-mono text-sm text-on-surface truncate max-w-105">{endpoint}</div>
                          {evt.url && evt.url !== endpoint && (
                            <div className="text-[11px] text-outline-variant truncate max-w-105">{evt.url}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold ${statusBadge(status)}`}>
                            {status ?? 'Unknown'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-on-surface-variant font-mono">
                          {formatDuration(evt.durationMs)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedEvent(evt)}
                            className="rounded-md border border-white/10 px-3 py-1 text-[11px] text-on-surface hover:bg-white/5"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-outline-variant">
          <span>
            Showing {events.length} of {allEvents.length} service API events
          </span>
          <span>Capture is namespace-scoped and service-filtered</span>
        </div>

        {selectedEvent && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl border border-white/10 bg-[#12141a] shadow-2xl shadow-black/40 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-white/3 shrink-0">
                <div>
                  <Typography variant="h2" className="text-on-surface text-xl">
                    API Event Details
                  </Typography>
                  <Typography variant="body" className="text-outline-variant text-sm mt-1">
                    {selectedEvent.method || 'TRACE'} {selectedEvent.endpoint || selectedEvent.url || selectedEvent.path || '-'}
                  </Typography>
                </div>
                <div className="flex items-center gap-2 text-outline-variant">
                  <button
                    title="Download JSON"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(selectedEvent, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `api-event-${selectedEvent.id}.json`;
                      a.click();
                    }}
                    className="p-2 rounded-xl hover:bg-white/10 hover:text-on-surface transition-colors"
                  >
                    <DownloadIcon fontSize="small" />
                  </button>
                  <button
                    title="Copy JSON"
                    onClick={() => navigator.clipboard?.writeText(JSON.stringify(selectedEvent, null, 2))}
                    className="p-2 rounded-xl hover:bg-white/10 hover:text-on-surface transition-colors"
                  >
                    <ContentCopyIcon fontSize="small" />
                  </button>
                  <button
                    title="Close"
                    onClick={() => setSelectedEvent(null)}
                    className="p-2 rounded-xl hover:bg-error/20 hover:text-error transition-colors ml-2"
                  >
                    <CloseIcon fontSize="small" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-6 overflow-y-auto terminal-scroll">
                <div className="rounded-2xl border border-white/8 bg-surface-container-low p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant mb-3">Request</div>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-outline-variant">Namespace:</span> <span className="text-on-surface">{selectedEvent.namespace}</span></div>
                    <div><span className="text-outline-variant">Source Service:</span> <span className="text-on-surface">{selectedEvent.sourceService || '-'}</span></div>
                    <div><span className="text-outline-variant">Source Pod:</span> <span className="text-on-surface">{selectedEvent.sourcePod || selectedEvent.sourceService || selectedEvent.sourceIp || '-'}</span></div>
                    <div><span className="text-outline-variant">Source IP:</span> <span className="text-on-surface font-mono">{selectedEvent.sourceIp || '-'}</span></div>
                    <div><span className="text-outline-variant">Destination Service:</span> <span className="text-on-surface">{selectedEvent.destService || '-'}</span></div>
                    <div><span className="text-outline-variant">Destination Pod:</span> <span className="text-on-surface">{selectedEvent.destPod || selectedEvent.destService || selectedEvent.destIp || '-'}</span></div>
                    <div><span className="text-outline-variant">Destination IP:</span> <span className="text-on-surface font-mono">{selectedEvent.destIp || '-'}</span></div>
                    <div><span className="text-outline-variant">Destination Port:</span> <span className="text-on-surface font-mono">{selectedEvent.destPort ?? '-'}</span></div>
                    <div><span className="text-outline-variant">Endpoint:</span> <span className="text-on-surface font-mono">{selectedEvent.endpoint || selectedEvent.url || selectedEvent.path || '-'}</span></div>
                    <div><span className="text-outline-variant">Request Origin:</span> <span className="text-on-surface">{requestOrigin(selectedEvent)}</span></div>
                    <div><span className="text-outline-variant">Status:</span> <span className="text-on-surface">{statusLabel(selectedEvent)}</span></div>
                    <div><span className="text-outline-variant">Duration:</span> <span className="text-on-surface">{formatDuration(selectedEvent.durationMs)}</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-surface-container-low p-4">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant mb-3">Request Headers</div>
                  <pre className="max-h-32 overflow-auto terminal-scroll text-xs text-on-surface-variant whitespace-pre-wrap break-all">
{JSON.stringify(selectedEvent.headers || {}, null, 2)}
                  </pre>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant mt-3 mb-2">Response Headers</div>
                  <pre className="max-h-32 overflow-auto terminal-scroll text-xs text-on-surface-variant whitespace-pre-wrap break-all">
{JSON.stringify((selectedEvent as any).responseHeaders || {}, null, 2) || '{}'}
                  </pre>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/8 bg-surface-container-low p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant mb-3">Response Body</div>
                    <pre className="max-h-40 overflow-auto terminal-scroll text-xs text-on-surface-variant whitespace-pre-wrap break-all">
{(selectedEvent.responseBody && selectedEvent.responseBody.length > 0) ? selectedEvent.responseBody : 'Response body not captured by the agent'}
                    </pre>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-surface-container-low p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant mb-3">Raw Event</div>
                    <pre className="max-h-75 overflow-auto terminal-scroll text-xs text-on-surface-variant whitespace-pre-wrap break-all">
{JSON.stringify(selectedEvent, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
