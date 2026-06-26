import React, { useEffect, useMemo, useState } from 'react';
import { Typography } from '../atoms/Typography';
import { Button } from '../atoms/Button';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';
import ApiIcon from '@mui/icons-material/Api';
import StorageIcon from '@mui/icons-material/Storage';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const severityOrder = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'TRACE', 'SYSTEM'] as const;

const inferSeverity = (line: string) => {
  const text = line.toLowerCase();
  if (/(error|failed|panic|exception|fatal|500|4\d\d)/i.test(text)) return 'ERROR';
  if (/(warn|warning|retry|slow|timeout|deprecat)/i.test(text)) return 'WARN';
  if (/(debug|payload|request id|trace id)/i.test(text)) return 'DEBUG';
  if (/(trace|span|incoming|outgoing)/i.test(text)) return 'TRACE';
  if (/(system|health|ready|started|connected|listening)/i.test(text)) return 'SYSTEM';
  return 'INFO';
};

type DrawerTab = 'telemetry' | 'logs';

type BlastFocusSummary = {
  node?: any;
  incoming: any[];
  outgoing: any[];
  upstreamCount: number;
  downstreamCount: number;
} | null;

type ActionPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  podName: string;
  logs: string[];
  nodeData?: any;
  edges?: any[];
  activeTab?: DrawerTab;
  onTabChange?: (tab: DrawerTab) => void;
  blastMode?: boolean;
  blastFocus?: BlastFocusSummary;
  mismatchAlerts?: Array<{ id: string; title: string; detail: string; severity: 'warn' | 'error' }>;
  timeTravelMinutes?: number;
  onToggleBlastMode?: () => void;
};

const safeNumber = (value: any) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const ActionPanel: React.FC<ActionPanelProps> = ({
  isOpen,
  onClose,
  podName,
  logs,
  nodeData,
  edges = [],
  activeTab,
  onTabChange,
  blastMode = false,
  blastFocus,
  mismatchAlerts = [],
  timeTravelMinutes = 0,
  onToggleBlastMode,
}) => {
  const [internalTab, setInternalTab] = useState<DrawerTab>('telemetry');
  const [logQuery, setLogQuery] = useState('');
  const [regexMode, setRegexMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string[]>(['INFO', 'WARN', 'ERROR']);

  const selectedTab = activeTab || internalTab;
  const setSelectedTab = onTabChange || setInternalTab;

  useEffect(() => {
    if (isOpen) {
      setSelectedTab('telemetry');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nodeData?.id]);

  const nodeId = nodeData?.id || '';
  const incomingEdges = useMemo(() => edges.filter((e) => e.target === nodeId), [edges, nodeId]);
  const outgoingEdges = useMemo(() => edges.filter((e) => e.source === nodeId), [edges, nodeId]);
  const nodeType = nodeData?.data?.type || 'pod';
  const nodeLabel = nodeData?.data?.label || podName || 'Unknown';

  const connectedEdges = useMemo(() => {
    if (blastFocus) return [...blastFocus.incoming, ...blastFocus.outgoing];
    return [...incomingEdges, ...outgoingEdges];
  }, [blastFocus, incomingEdges, outgoingEdges]);

  const metrics = useMemo(() => {
    const durations = connectedEdges.map((edge) => safeNumber(edge.data?.durationMs)).filter((value) => value > 0);
    const errorEdges = connectedEdges.filter((edge) => Number(edge.data?.statusCode || 0) >= 400);
    const httpEdges = connectedEdges.filter((edge) => edge.data?.endpoint || edge.data?.method);
    const rps = connectedEdges.length;
    const errorRate = connectedEdges.length > 0 ? Math.round((errorEdges.length / connectedEdges.length) * 100) : 0;
    const p99 = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      rps,
      errorRate,
      p99,
      httpCalls: httpEdges.length,
    };
  }, [connectedEdges]);

  const contractRows = useMemo(() => {
    const grouped = new Map<string, { endpoint: string; count: number; errors: number; lastStatus?: number; totalDuration: number }>();

    connectedEdges.forEach((edge) => {
      const endpoint = edge.data?.endpoint || edge.label || 'TCP';
      const key = `${edge.source}::${edge.target}::${endpoint}`;
      const entry = grouped.get(key) || { endpoint, count: 0, errors: 0, lastStatus: undefined, totalDuration: 0 };
      entry.count += 1;
      if (Number(edge.data?.statusCode || 0) >= 400) entry.errors += 1;
      entry.lastStatus = edge.data?.statusCode ?? entry.lastStatus;
      entry.totalDuration += safeNumber(edge.data?.durationMs);
      grouped.set(key, entry);
    });

    return Array.from(grouped.values()).slice(0, 6);
  }, [connectedEdges]);

  const visibleLogs = useMemo(() => {
    const source = paused ? logs.slice(0, logs.length) : logs;
    const filteredBySeverity = source.filter((line) => severityFilter.includes(inferSeverity(line)));

    if (!logQuery.trim()) return filteredBySeverity;

    try {
      if (regexMode) {
        const regex = new RegExp(logQuery, 'i');
        return filteredBySeverity.filter((line) => regex.test(line));
      }
    } catch {
      // ignore invalid regex and fallback to simple includes
    }

    const q = logQuery.toLowerCase();
    return filteredBySeverity.filter((line) => line.toLowerCase().includes(q));
  }, [logs, logQuery, paused, regexMode, severityFilter]);

  const hasMismatch = useMemo(() => {
    return mismatchAlerts.length > 0 || connectedEdges.some((edge) => Number(edge.data?.statusCode || 0) >= 400);
  }, [connectedEdges, mismatchAlerts.length]);

  if (!isOpen) return null;

  return (
    <div className="absolute right-6 top-6 bottom-6 w-[470px] glass-panel flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="flex items-start justify-between gap-4 p-5 border-b border-white/10 bg-surface-container-low/60 backdrop-blur-xl">
        <div className="min-w-0">
          <Typography variant="h2" className="text-on-surface truncate">
            {nodeLabel}
          </Typography>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className={`w-2.5 h-2.5 rounded-full ${nodeType === 'service' ? 'bg-primary' : nodeType === 'db' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <Typography variant="label" className="!text-[10px] text-on-surface-variant uppercase tracking-[0.18em]">
              {nodeType} • {timeTravelMinutes > 0 ? `Replay ${timeTravelMinutes}m` : 'Live'}
            </Typography>
            {blastMode && (
              <span className="rounded-full border border-error/25 bg-error/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-error">
                Blast Radius
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors p-1">
          <CloseIcon fontSize="small" />
        </button>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/4 p-1">
          <button
            onClick={() => setSelectedTab('telemetry')}
            className={`rounded-xl px-3 py-2 text-sm transition-all ${selectedTab === 'telemetry' ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant hover:bg-white/5 hover:text-on-surface'}`}
          >
            Telemetry & Traffic
          </button>
          <button
            onClick={() => setSelectedTab('logs')}
            className={`rounded-xl px-3 py-2 text-sm transition-all ${selectedTab === 'logs' ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant hover:bg-white/5 hover:text-on-surface'}`}
          >
            Live Log Terminal
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-5 overflow-y-auto">
        {selectedTab === 'telemetry' ? (
          <>
            {hasMismatch && (
              <div className="mb-4 rounded-2xl border border-error/25 bg-error/10 p-4 text-sm text-error">
                <div className="flex items-center gap-2 font-semibold">
                    <WarningAmberIcon fontSize="small" /> L4/L7 mismatch risk
                </div>
                <div className="mt-2 text-xs text-error/90">
                  TCP reachability exists, but L7 parsing or contract validation is failing on one or more paths.
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <div className="flex items-center gap-2 text-outline-variant text-[10px] uppercase tracking-[0.18em] mb-2">
                  <SpeedIcon fontSize="inherit" /> RPS
                </div>
                <div className="text-2xl font-semibold text-on-surface">{metrics.rps}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <div className="flex items-center gap-2 text-outline-variant text-[10px] uppercase tracking-[0.18em] mb-2">
                  <ApiIcon fontSize="inherit" /> p99 Latency
                </div>
                <div className="text-2xl font-semibold text-on-surface">{metrics.p99 ? `${metrics.p99} ms` : '—'}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <div className="flex items-center gap-2 text-outline-variant text-[10px] uppercase tracking-[0.18em] mb-2">
                  <StorageIcon fontSize="inherit" /> Errors
                </div>
                <div className="text-2xl font-semibold text-on-surface">{metrics.errorRate}%</div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/8 bg-surface-container-low/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <Typography variant="label" className="text-outline-variant">Blast Radius</Typography>
                <button
                  onClick={onToggleBlastMode}
                  className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] text-on-surface hover:bg-white/10"
                >
                  {blastMode ? 'Exit isolation' : 'Enable isolation'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-outline-variant">
                <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                  <div className="uppercase tracking-[0.18em] text-[10px] mb-1">Upstream callers</div>
                  <div className="text-on-surface text-base font-semibold">{blastFocus?.upstreamCount ?? 0}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                  <div className="uppercase tracking-[0.18em] text-[10px] mb-1">Downstream deps</div>
                  <div className="text-on-surface text-base font-semibold">{blastFocus?.downstreamCount ?? 0}</div>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/8 bg-surface-container-low/30 p-4">
              <Typography variant="label" className="mb-3 block text-outline-variant">Active L7 Contract Matrix</Typography>
              <div className="space-y-2">
                {contractRows.length > 0 ? contractRows.map((row, idx) => (
                  <div key={`${row.endpoint}-${idx}`} className="rounded-xl border border-white/8 bg-white/4 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-on-surface truncate">{row.endpoint}</div>
                      <div className="text-outline-variant">{row.errors}/{row.count} failed</div>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-outline-variant">
                      <span>Status {row.lastStatus ?? '—'}</span>
                      <span>Avg {row.count ? Math.round(row.totalDuration / row.count) : 0} ms</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-sm text-outline-variant">No L7 telemetry yet.</div>
                )}
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/8 bg-surface-container-low/30 p-4">
              <Typography variant="label" className="mb-3 block text-outline-variant">Topology Hints</Typography>
              <div className="space-y-2 text-sm text-outline-variant">
                <div className="rounded-xl border border-white/8 bg-white/4 p-3">Incoming paths: {incomingEdges.length}</div>
                <div className="rounded-xl border border-white/8 bg-white/4 p-3">Outgoing paths: {outgoingEdges.length}</div>
                <div className="rounded-xl border border-white/8 bg-white/4 p-3">Observed time window: {timeTravelMinutes > 0 ? `${timeTravelMinutes} minute replay` : 'live'}</div>
              </div>
            </div>

            {mismatchAlerts.length > 0 && (
              <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                <Typography variant="label" className="mb-3 block text-amber-200">Mismatch alerts</Typography>
                <div className="space-y-2 text-xs text-amber-100/90">
                  {mismatchAlerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-amber-400/15 bg-black/10 p-3">
                      <div className="font-semibold">{alert.title}</div>
                      <div className="mt-1">{alert.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 rounded-2xl border border-white/8 bg-surface-container-low/30 p-4">
              <Typography variant="label" className="mb-3 block text-outline-variant">Advanced Log Filter Bar</Typography>
              <div className="flex flex-wrap gap-2 mb-3">
                {severityOrder.map((severity) => {
                  const active = severityFilter.includes(severity);
                  return (
                    <button
                      key={severity}
                      onClick={() => setSeverityFilter((prev) => prev.includes(severity) ? prev.filter((item) => item !== severity) : [...prev, severity])}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-wide ${active ? 'border-primary/30 bg-primary/15 text-primary-fixed' : 'border-white/8 bg-white/5 text-outline-variant'}`}
                    >
                      {severity}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                <input
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  placeholder="Multi-keyword or regex filter"
                  className="flex-1 bg-transparent text-sm text-on-surface outline-none"
                />
                <label className="flex items-center gap-2 text-[11px] text-outline-variant">
                  <input type="checkbox" checked={regexMode} onChange={(e) => setRegexMode(e.target.checked)} /> Regex
                </label>
                <button
                  onClick={() => setPaused((v) => !v)}
                  className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-[11px] text-on-surface hover:bg-white/10"
                >
                  {paused ? 'Sync' : 'Pause'}
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-white/8 bg-surface-container-low/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <Typography variant="label" className="text-outline-variant">Live Log Terminal</Typography>
                <div className="text-[11px] text-outline-variant">{visibleLogs.length} lines</div>
              </div>
              <div className="max-h-[380px] overflow-y-auto terminal-scroll rounded-xl border border-white/8 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-on-surface">
                {visibleLogs.length > 0 ? visibleLogs.slice(-250).map((line, index) => {
                  const severity = inferSeverity(line);
                  return (
                    <div key={`${index}-${line.slice(0, 30)}`} className="whitespace-pre-wrap break-all border-b border-white/5 py-1 last:border-b-0">
                      <span className={`mr-2 rounded-full px-2 py-0.5 text-[9px] font-semibold ${severity === 'ERROR' ? 'bg-error/15 text-error' : severity === 'WARN' ? 'bg-amber-400/15 text-amber-200' : severity === 'DEBUG' ? 'bg-sky-400/15 text-sky-200' : severity === 'TRACE' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-outline-variant'}`}>{severity}</span>
                      {line}
                    </div>
                  );
                }) : (
                  <div className="text-outline-variant">No logs yet.</div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="mb-6">
          <Typography variant="label" className="mb-3 block text-outline-variant">Quick Actions</Typography>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" size="sm" className="w-full text-error border-error/20 hover:bg-error/10 hover:text-error">
              {nodeType === 'service' ? 'Delete Service' : 'Restart Pod'}
            </Button>
            <Button variant="ghost" size="sm" className="w-full">
              <PlayArrowIcon fontSize="inherit" className="mr-1" /> Port-Forward
            </Button>
            {nodeType === 'pod' && (
              <Button variant="ghost" size="sm" className="w-full col-span-2">
                <TerminalIcon fontSize="inherit" className="mr-1" /> Execute Shell
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
