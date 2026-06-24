import React from 'react';
import { Typography } from '../atoms/Typography';
import { Button } from '../atoms/Button';
import { LogTerminal } from './LogTerminal';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';

type ActionPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  podName: string;
  logs: string[];
};

export const ActionPanel: React.FC<ActionPanelProps> = ({ isOpen, onClose, podName, logs }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute right-6 top-6 bottom-6 w-[400px] glass-panel flex flex-col z-50 overflow-hidden animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-5 border-b border-white/10 bg-surface-container-low/50">
        <div>
          <Typography variant="h2" className="text-on-surface">
            {podName || 'Unknown Pod'}
          </Typography>
          <div className="flex items-center space-x-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-accent-green glow-green" />
            <Typography variant="label" className="text-accent-green !text-[10px]">
              Running • 10h Uptime
            </Typography>
          </div>
        </div>
        <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors p-1">
          <CloseIcon fontSize="small" />
        </button>
      </div>

      <div className="flex-1 flex flex-col p-5 overflow-hidden">
        
        {/* Quick Actions */}
        <div className="mb-6">
          <Typography variant="label" className="mb-3 block text-outline-variant">Quick Actions</Typography>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" size="sm" className="w-full text-error border-error/20 hover:bg-error/10 hover:text-error">
              Restart Pod
            </Button>
            <Button variant="ghost" size="sm" className="w-full">
              <PlayArrowIcon fontSize="inherit" className="mr-1" /> Port-Forward
            </Button>
            <Button variant="ghost" size="sm" className="w-full col-span-2">
              <TerminalIcon fontSize="inherit" className="mr-1" /> Execute Shell
            </Button>
          </div>
        </div>

        {/* Live Logs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <Typography variant="label" className="text-outline-variant">Terminal / Logs</Typography>
            <Button variant="ghost" className="!h-6 !px-2 !text-[10px]">Download</Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <LogTerminal logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
};
