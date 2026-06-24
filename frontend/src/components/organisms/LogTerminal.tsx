import React from 'react';
import { Typography } from '../atoms/Typography';

type LogTerminalProps = {
  logs: string[];
};

export const LogTerminal: React.FC<LogTerminalProps> = ({ logs }) => {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] rounded-md border border-white/10 overflow-hidden">
      <div className="bg-[#1a1a1a] px-3 py-1.5 border-b border-white/10 flex items-center space-x-2">
        <div className="flex space-x-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-error" />
          <div className="w-2.5 h-2.5 rounded-full bg-tertiary-container" />
          <div className="w-2.5 h-2.5 rounded-full bg-accent-green" />
        </div>
        <Typography variant="code" className="text-[10px] text-outline ml-2">bash - live stream</Typography>
      </div>
      
      <div className="flex-1 p-3 overflow-y-auto terminal-scroll">
        {logs.length === 0 ? (
          <Typography variant="code" className="text-outline-variant">Waiting for logs...</Typography>
        ) : (
          logs.map((log, i) => (
            <Typography key={i} variant="code" className="text-on-surface !text-xs whitespace-pre-wrap leading-tight block">
              {log}
            </Typography>
          ))
        )}
      </div>
    </div>
  );
};
