'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import { io } from 'socket.io-client';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';
import { apiUrl, socketUrl } from '../../lib/backend';
interface Pod {
  name: string;
  status: string;
  namespace: string;
  ip?: string;
  nodeName?: string;
  restarts?: number;
  readyContainers?: number;
  totalContainers?: number;
  labels?: Record<string, string>;
  createdAt?: string;
}

interface LogEntry {
  id: string;
  raw: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRACE' | 'SYSTEM';
  text: string;
}

const stripAnsi = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

const inferLevel = (line: string): LogEntry['level'] => {
  const l = line.toLowerCase();
  if (/(\berror\b|fatal|panic|failed|exception|traceback)/i.test(line)) return 'ERROR';
  if (/(\bwarn\b|warning|deprecated|latency|retrying)/i.test(line)) return 'WARN';
  if (/(\bdebug\b|payload:|request id|x-request-id)/i.test(line)) return 'DEBUG';
  if (/(\btrace\b|incoming|outgoing|http\s+(get|post|put|delete|patch))/i.test(line)) return 'TRACE';
  if (/^\[system\]|connecting to logs stream/i.test(line)) return 'SYSTEM';
  if (/(\binfo\b|started|ready|success|registered|listening)/i.test(line) || l.startsWith('20')) return 'INFO';
  return 'INFO';
};

const severityOrder: Record<string, number> = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4, SYSTEM: 5 };

const levelStyles: Record<LogEntry['level'], { pill: string; border: string; text: string }> = {
  ERROR: { pill: 'bg-error/10 text-error border-error/20', border: 'border-error/20', text: 'text-error' },
  WARN: { pill: 'bg-orange-500/10 text-orange-300 border-orange-500/20', border: 'border-orange-500/20', text: 'text-orange-300' },
  INFO: { pill: 'bg-primary/10 text-primary-fixed border-primary/20', border: 'border-primary/20', text: 'text-primary-fixed' },
  DEBUG: { pill: 'bg-sky-500/10 text-sky-300 border-sky-500/20', border: 'border-sky-500/20', text: 'text-sky-300' },
  TRACE: { pill: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', border: 'border-emerald-500/20', text: 'text-emerald-300' },
  SYSTEM: { pill: 'bg-surface-container text-outline border-white/10', border: 'border-white/8', text: 'text-outline' },
};

export default function LogsPage() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [podSearch, setPodSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<string[]>(['INFO', 'WARN', 'ERROR']);
  const [socket, setSocket] = useState<any>(null);
  const [loadingPods, setLoadingPods] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [endpointFilter, setEndpointFilter] = useState('');
  const [timeRangeMinutes, setTimeRangeMinutes] = useState(5);
  const [markedTimestamp, setMarkedTimestamp] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;
    setLoadingPods(true);
    fetch(apiUrl(`/api/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/pods`))
      .then((res) => res.json())
      .then((data) => {
        const sorted = (data || []).sort((a: Pod, b: Pod) => a.name.localeCompare(b.name));
        setPods(sorted);
        setSelectedPod((current) => current || sorted[0]?.name || '');
        setLoadingPods(false);
      })
      .catch((err) => {
        console.error('Failed to fetch pods', err);
        setLoadingPods(false);
      });
  }, [selectedContext, selectedNamespace]);

  useEffect(() => {
    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Logs socket connected');
    });

    newSocket.on('logUpdate', (logLine: string) => {
      if (!isLive) return;
      const cleanLine = stripAnsi(logLine).trimEnd();
      if (!cleanLine) return;

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        raw: cleanLine,
        timestamp: new Date().toISOString(),
        level: inferLevel(cleanLine),
        text: cleanLine,
      };

      setEntries((prev) => [...prev, entry].slice(-800));
    });

    return () => {
      newSocket.close();
    };
  }, [isLive]);

  useEffect(() => {
    if (!socket || !selectedPod || !selectedContext || !selectedNamespace) {
      setEntries([]);
      return;
    }

    setEntries([
      {
        id: 'system-start',
        raw: `[System] Connecting to logs stream for ${selectedPod}...`,
        timestamp: new Date().toISOString(),
        level: 'SYSTEM',
        text: `[System] Connecting to logs stream for ${selectedPod}...`,
      },
    ]);

    socket.emit('subscribeLogs', {
      context: selectedContext,
      namespace: selectedNamespace,
      podName: selectedPod,
    });

    return () => {
      socket.emit('unsubscribeLogs');
    };
  }, [socket, selectedPod, selectedContext, selectedNamespace]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries, autoScroll]);

  const filteredPods = useMemo(() => {
    const q = podSearch.toLowerCase();
    return pods.filter((pod) => pod.name.toLowerCase().includes(q) || (pod.labels && Object.values(pod.labels).join(' ').toLowerCase().includes(q)));
  }, [pods, podSearch]);

  const visibleEntries = useMemo(() => {
    let filtered = entries
      .filter((entry) => selectedLevels.includes(entry.level))
      .filter((entry) => !logSearch || entry.text.toLowerCase().includes(logSearch.toLowerCase()));

    if (endpointFilter && markedTimestamp) {
      const markedTime = new Date(markedTimestamp).getTime();
      const rangeMs = timeRangeMinutes * 60 * 1000;
      filtered = filtered.filter((entry) => {
        const entryTime = new Date(entry.timestamp).getTime();
        return Math.abs(entryTime - markedTime) <= rangeMs;
      });
    } else if (endpointFilter) {
      filtered = filtered.filter((entry) => entry.text.toLowerCase().includes(endpointFilter.toLowerCase()));
    }

    return filtered;
  }, [entries, logSearch, selectedLevels, endpointFilter, markedTimestamp, timeRangeMinutes]);

  const selectedPodDetails = pods.find((p) => p.name === selectedPod);

  const handleMarkEndpoint = (timestamp: string) => {
    setMarkedTimestamp(timestamp);
    setEndpointFilter('');
  };

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  };

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(visibleEntries.map((e) => e.raw).join('\n'));
    } catch {
      // ignore
    }
  };

  const clearLogs = () => setEntries([]);

  const downloadLogs = () => {
    const blob = new Blob([visibleEntries.map((e) => e.raw).join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPod || 'logs'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const renderPods = () => {
    return (
      <div className='bg-white/3 rounded-2xl'>
        <div className="p-4 border-b border-white/8 ">
          <Typography variant="h3" className="text-sm uppercase tracking-[0.22em] text-outline-variant mb-3">
            PODS
          </Typography>
          <div className="relative">
            <SearchIcon fontSize="small" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={podSearch}
              onChange={(e) => setPodSearch(e.target.value)}
              placeholder="Search pods..."
              className="w-full rounded-2xl bg-surface-container-lowest border border-white/8 pl-10 pr-3 py-2 text-sm text-on-surface outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto terminal-scroll p-3 space-y-2">
          {loadingPods ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredPods.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-outline gap-2 text-center p-6">
              <InfoOutlinedIcon fontSize="small" />
              <Typography variant="body" className="text-xs">No pods found in this namespace.</Typography>
            </div>
          ) : (
            filteredPods.map((pod) => {
              const ready = pod.status === 'Running';
              const isSelected = selectedPod === pod.name;
              return (
                <button
                  key={pod.name}
                  onClick={() => setSelectedPod(pod.name)}
                  className={`w-full text-left rounded-2xl border px-3 py-3 transition-all ${isSelected
                    ? 'border-primary/30 bg-primary/10 shadow-[0_0_0_1px_rgba(173,198,255,0.08)]'
                    : 'border-white/5 bg-surface-container-lowest/40 hover:bg-white/5'
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-on-surface truncate">{pod.name}</div>
                      <div className="text-[11px] text-outline-variant mt-1">{pod.namespace}</div>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-outline-variant">
                    <span>{pod.status}</span>
                    <span>{pod.readyContainers ?? 0}/{pod.totalContainers ?? 0}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    )
  }

  const renderLogs = () => {
    return (
      <div className='rounded-2xl'>
        <div className="border-b border-white/8 bg-[#12151b] px-5 py-3 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-outline-variant">
            Severity
          </div>
          {(['INFO', 'WARN', 'ERROR', 'DEBUG', 'TRACE', 'SYSTEM'] as const).map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`rounded-xl border px-3 py-2 text-[11px] font-semibold tracking-wide ${selectedLevels.includes(level) ? levelStyles[level].pill : 'border-white/8 bg-transparent text-outline-variant'
                }`}
            >
              {level}
            </button>
          ))}

          <div className="relative flex-1 min-w-[220px] ml-auto">
            <SearchIcon fontSize="small" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filter with Regex..."
              className="w-full rounded-xl bg-surface-container-lowest border border-white/8 pl-10 pr-3 py-2 text-sm text-on-surface outline-none"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-5 py-2 border-b border-white/8 bg-[#11151a] flex items-center justify-between shrink-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-outline-variant">Stream</div>
            <div className="text-[11px] text-outline-variant">Showing {visibleEntries.length} entries</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto terminal-scroll bg-[#0d1014] px-5 py-4 overscroll-contain">
            {
              visibleEntries.length == 0 ? (
                <div className="h-full flex items-center justify-center text-outline text-sm">
                  No logs matching filter / wait for stream
                </div>
              ) : (
                <>
                  <div className="space-y-2 font-mono text-[12px] leading-relaxed">
                    {

                      visibleEntries.map((entry) => {
                        const style = levelStyles[entry.level];
                        const isMarked = markedTimestamp === entry.timestamp;
                        return (
                          <div key={entry.id} className={`rounded-2xl border ${style.border} px-4 py-3 ${isMarked ? 'bg-primary/15 border-primary/40' : 'bg-white/3'}`}>
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${style.pill}`}>
                                  {entry.level}
                                </span>
                                <span className="text-[11px] text-outline-variant">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <button
                                onClick={() => handleMarkEndpoint(entry.timestamp)}
                                className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${isMarked ? 'border-primary/40 bg-primary/10 text-primary-fixed' : 'border-white/8 bg-white/3 text-outline-variant hover:bg-white/5'}`}
                                title="Mark this timestamp to search nearby logs"
                              >
                                📍
                              </button>
                            </div>
                            <div className="whitespace-pre-wrap break-all text-on-surface">{entry.text}</div>
                          </div>
                        );
                      })
                    }
                  </div>
                </>
              )
            }
          </div>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden bg-linear-to-b from-surface to-surface-container-lowest">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TerminalIcon className="text-primary" fontSize="small" />
              <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
                Log Management
              </Typography>
            </div>
            <Typography variant="body" className="text-on-surface-variant text-sm">
              Pods and live logs in namespace <span className="text-primary font-medium">{selectedNamespace || 'default'}</span>
            </Typography>
          </div>

          <div className="relative">
            <button
              onClick={() => setActionsOpen(!actionsOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs border border-white/8 bg-surface-container-low text-on-surface hover:bg-white/5"
            >
              Actions {actionsOpen ? '▲' : '▼'}
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-white/10 bg-[#1e2128] shadow-2xl overflow-hidden z-20 flex flex-col">
                <button
                  onClick={() => {
                    setIsLive((v) => !v);
                    setActionsOpen(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 hover:bg-white/5 ${isLive ? 'text-emerald-300' : 'text-outline'}`}
                >
                  {isLive ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                  {isLive ? 'Pause Stream' : 'Resume Stream'}
                </button>
                <button
                  onClick={() => {
                    setAutoScroll((v) => !v);
                    setActionsOpen(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 hover:bg-white/5 ${autoScroll ? 'text-primary-fixed' : 'text-outline'}`}
                >
                  Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>
                {/* <button
                  onClick={() => {
                    setShowContext((v) => !v);
                    setActionsOpen(false);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 hover:bg-white/5 ${showContext ? 'text-primary-fixed' : 'text-outline'}`}
                >
                  {showContext ? <CloseIcon fontSize="small" /> : <InfoOutlinedIcon fontSize="small" />}
                  {showContext ? 'Hide Context' : 'Show Context'}
                </button> */}
                <button onClick={() => { copyLogs(); setActionsOpen(false); }} className="flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 text-on-surface hover:bg-white/5">
                  <ContentCopyIcon fontSize="small" /> Copy
                </button>
                <button onClick={() => { downloadLogs(); setActionsOpen(false); }} className="flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 text-on-surface hover:bg-white/5">
                  <CloudDownloadIcon fontSize="small" /> Download
                </button>
                <button onClick={() => { clearLogs(); setActionsOpen(false); }} className="flex items-center gap-2 px-4 py-3 text-xs border-b border-white/5 text-on-surface hover:bg-white/5">
                  <ClearAllIcon fontSize="small" /> Clear
                </button>
                <button onClick={() => { setEntries([]); setActionsOpen(false); }} className="flex items-center gap-2 px-4 py-3 text-xs text-on-surface hover:bg-white/5">
                  <RefreshIcon fontSize="small" /> Reset
                </button>
              </div>
            )}
          </div>

        </div>
        <div className="mb-4 rounded-2xl border border-white/6 bg-surface-container-low/50 px-4 py-3 backdrop-blur-sm shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-[0.16em] text-outline-variant whitespace-nowrap">Endpoint</label>
              <div className="relative">
                <SearchIcon fontSize="small" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  type="text"
                  value={endpointFilter}
                  onChange={(e) => {
                    setEndpointFilter(e.target.value);
                    if (!e.target.value) setMarkedTimestamp(null);
                  }}
                  placeholder="e.g., /api/payment"
                  className="rounded-xl bg-surface-container px-9 py-1.5 text-sm text-on-surface outline-none border border-white/6 w-[200px]"
                />
              </div>
            </div>

            {markedTimestamp && (
              <div className="flex items-center gap-2">
                <label className="text-xs uppercase tracking-[0.16em] text-outline-variant whitespace-nowrap">Range</label>
                <select
                  value={timeRangeMinutes}
                  onChange={(e) => setTimeRangeMinutes(Number(e.target.value))}
                  className="rounded-xl bg-surface-container px-3 py-1.5 text-sm text-on-surface outline-none border border-white/6"
                >
                  <option value="1">1 min</option>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                </select>
                <button
                  onClick={() => {
                    setMarkedTimestamp(null);
                    setEndpointFilter('');
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs border border-white/8 bg-error/10 text-error hover:bg-error/20"
                >
                  Clear Range
                </button>
              </div>
            )}

            {markedTimestamp && (
              <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border border-primary/25 bg-primary/10 text-xs text-primary-fixed">
                <span>📍 Searching around {new Date(markedTimestamp).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>
        <div className='flex gap-2'>
          <div className="w-1/4">
            {renderPods()}
          </div>
          <div className="w-3/4">
            {renderLogs()}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


