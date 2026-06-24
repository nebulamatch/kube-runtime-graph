'use client';

import React, { useEffect, useState, useRef } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import { io } from 'socket.io-client';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import SearchIcon from '@mui/icons-material/Search';

interface Pod {
  name: string;
  status: string;
  namespace: string;
}

export default function LogsPage() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [socket, setSocket] = useState<any>(null);
  const [loadingPods, setLoadingPods] = useState(false);
  const [isLive, setIsLive] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch pods in current namespace
  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;
    setLoadingPods(true);
    fetch(`http://localhost:3001/api/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/pods`)
      .then((res) => res.json())
      .then((data) => {
        setPods(data || []);
        if (data && data.length > 0) {
          setSelectedPod(data[0].name);
        } else {
          setSelectedPod('');
        }
        setLoadingPods(false);
      })
      .catch((err) => {
        console.error('Failed to fetch pods', err);
        setLoadingPods(false);
      });
  }, [selectedContext, selectedNamespace]);

  // Connect WebSockets
  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Logs socket connected');
    });

    newSocket.on('logUpdate', (logLine: string) => {
      if (isLive) {
        setLogs((prev) => [...prev, logLine].slice(-500)); // Limit cache size
      }
    });

    return () => {
      newSocket.close();
    };
  }, [isLive]);

  // Stream logs when selectedPod changes
  useEffect(() => {
    if (!socket || !selectedPod || !selectedContext || !selectedNamespace) {
      setLogs([]);
      return;
    }

    setLogs([`[System] Connecting to logs stream for ${selectedPod}...`]);

    socket.emit('subscribeLogs', {
      context: selectedContext,
      namespace: selectedNamespace,
      podName: selectedPod,
    });

    return () => {
      socket.emit('unsubscribeLogs');
    };
  }, [socket, selectedPod, selectedContext, selectedNamespace]);

  // Scroll to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const filteredLogs = logs.filter((line) =>
    line.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="h-full flex p-6 space-x-6 overflow-hidden">
        {/* Sidebar Pod Selector */}
        <div className="w-[300px] glass-panel rounded-xl p-4 flex flex-col h-full">
          <Typography variant="h3" className="text-sm font-semibold mb-4 text-outline-variant uppercase tracking-wider">
            Pods ({pods.length})
          </Typography>
          {loadingPods ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pods.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-outline space-y-2 text-center p-4">
              <InfoOutlinedIcon fontSize="small" />
              <Typography variant="body" className="text-xs">No pods found in namespace.</Typography>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 terminal-scroll">
              {pods.map((pod) => (
                <button
                  key={pod.name}
                  onClick={() => setSelectedPod(pod.name)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between border ${
                    selectedPod === pod.name
                      ? 'bg-primary/10 border-primary/30 text-primary-fixed font-medium'
                      : 'border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                  }`}
                >
                  <span className="truncate mr-2">{pod.name}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    pod.status === 'Running' ? 'bg-accent-green' : 'bg-tertiary-container'
                  }`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Terminal Logger */}
        <div className="flex-1 flex flex-col h-full glass-panel rounded-xl overflow-hidden border border-white/5 bg-surface-container-lowest">
          {/* Toolbar */}
          <div className="border-b border-white/5 bg-surface-container-low/60 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <TerminalIcon className="text-primary" fontSize="small" />
              <Typography variant="h3" className="text-sm font-medium text-on-surface">
                {selectedPod ? `Logs: ${selectedPod}` : 'Log Console'}
              </Typography>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Search Bar */}
              <div className="relative">
                <SearchIcon fontSize="small" className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-outline" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-surface-container-lowest border border-white/5 rounded-md pl-8 pr-3 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-[160px] transition-all"
                />
              </div>

              {/* Live Indicator */}
              <button 
                onClick={() => setIsLive(!isLive)}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  isLive 
                    ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' 
                    : 'bg-surface-container hover:bg-surface-container-high border border-white/5 text-outline'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-accent-green animate-pulse' : 'bg-outline'}`} />
                <span>{isLive ? 'LIVE' : 'PAUSED'}</span>
              </button>

              <button
                onClick={() => setLogs([])}
                className="text-xs text-outline hover:text-on-surface transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Code/Logs Output */}
          <div className="flex-1 p-4 font-mono text-xs overflow-y-auto terminal-scroll bg-surface-container-lowest/80 text-on-surface-variant flex flex-col space-y-1 leading-relaxed">
            {filteredLogs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-outline">
                No logs matching filter / wait for stream
              </div>
            ) : (
              filteredLogs.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap select-text break-all">
                  {line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
