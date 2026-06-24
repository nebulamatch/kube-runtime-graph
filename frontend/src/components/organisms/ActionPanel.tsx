import React, { useMemo } from 'react';
import { Typography } from '../atoms/Typography';
import { Button } from '../atoms/Button';
import { LogTerminal } from './LogTerminal';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';
import ApiIcon from '@mui/icons-material/Api';
import StorageIcon from '@mui/icons-material/Storage';

type ActionPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  podName: string;
  logs: string[];
  nodeData?: any;
  edges?: any[];
};

export const ActionPanel: React.FC<ActionPanelProps> = ({ isOpen, onClose, podName, logs, nodeData, edges = [] }) => {
  if (!isOpen) return null;

  // Find incoming and outgoing edges for this node
  const nodeId = nodeData?.id || '';
  const incomingEdges = useMemo(() => edges.filter(e => e.target === nodeId), [nodeId, edges]);
  const outgoingEdges = useMemo(() => edges.filter(e => e.source === nodeId), [nodeId, edges]);

  const nodeType = nodeData?.data?.type || 'pod';
  const nodeLabel = nodeData?.data?.label || podName || 'Unknown';

  return (
    <div className="absolute right-6 top-6 bottom-6 w-[450px] glass-panel flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-5 border-b border-white/10 bg-surface-container-low/50">
        <div>
          <Typography variant="h2" className="text-on-surface">
            {nodeLabel}
          </Typography>
          <div className="flex items-center space-x-2 mt-1">
            <span className={`w-2 h-2 rounded-full glow-green ${nodeType === 'service' ? 'bg-accent-blue' : 'bg-accent-green'}`} />
            <Typography variant="label" className={`!text-[10px] ${nodeType === 'service' ? 'text-accent-blue' : 'text-accent-green'}`}>
              {nodeType === 'service' ? 'Service' : 'Pod'} • {nodeType === 'service' ? 'Cluster' : '10h Uptime'}
            </Typography>
          </div>
        </div>
        <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors p-1">
          <CloseIcon fontSize="small" />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-5 overflow-y-auto">
        
        {/* Service -> Pod -> API Flow */}
        {nodeType === 'service' && (
          <div className="mb-6 p-4 bg-surface-container-low/30 rounded border border-white/5">
            <Typography variant="label" className="mb-3 block text-outline-variant">Service Topology</Typography>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-accent-blue">●</span>
                <Typography variant="body" className="text-on-surface-variant">Service: {nodeLabel}</Typography>
              </div>
              {/* Show connected pods */}
              <div className="ml-4 space-y-1">
                {outgoingEdges.map((edge, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-accent-green">✓</span>
                    <Typography variant="body" className="text-on-surface-variant text-xs">Pod (connected)</Typography>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* API Calls Flow */}
        {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
          <div className="mb-6 p-4 bg-surface-container-low/30 rounded border border-white/5">
            <Typography variant="label" className="mb-3 block text-outline-variant flex items-center gap-2">
              <ApiIcon fontSize="small" /> API Calls
            </Typography>
            
            {outgoingEdges.length > 0 && (
              <div className="mb-3">
                <Typography variant="body" className="text-on-surface-variant text-xs mb-2">Outgoing Calls</Typography>
                {outgoingEdges.map((edge, idx) => (
                  <div key={idx} className="text-xs ml-2 mb-1 p-2 bg-accent-green/10 rounded border border-accent-green/20">
                    <div className="font-mono text-accent-green">{edge.label || 'API Call'}</div>
                    {edge.data?.originService && (
                      <div className="text-on-surface-variant mt-1">
                        Origin: {edge.data.originService}
                      </div>
                    )}
                    {edge.data?.endpoint && (
                      <div className="text-on-surface-variant">
                        Endpoint: {edge.data.endpoint}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {incomingEdges.length > 0 && (
              <div>
                <Typography variant="body" className="text-on-surface-variant text-xs mb-2">Incoming Calls</Typography>
                {incomingEdges.map((edge, idx) => (
                  <div key={idx} className="text-xs ml-2 mb-1 p-2 bg-accent-blue/10 rounded border border-accent-blue/20">
                    <div className="font-mono text-accent-blue">{edge.label || 'API Call'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
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

        {/* Live Logs - only show for pods */}
        {nodeType === 'pod' && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-3">
              <Typography variant="label" className="text-outline-variant">Terminal / Logs</Typography>
              <Button variant="ghost" className="!h-6 !px-2 !text-[10px]">Download</Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <LogTerminal logs={logs} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
