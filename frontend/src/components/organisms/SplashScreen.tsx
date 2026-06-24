import React from 'react';
import { Typography } from '../atoms/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-surface-container-lowest z-50 flex flex-col items-center justify-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-primary-container blur-[40px] opacity-20 animate-pulse rounded-full" />
        <div className="relative w-16 h-16 rounded-xl bg-surface-container border border-white/5 shadow-2xl flex items-center justify-center text-primary-fixed">
          <DashboardIcon fontSize="large" />
        </div>
      </div>
      
      <Typography variant="h2" className="mb-2 text-on-surface">
        KubeGraph
      </Typography>
      
      <div className="flex items-center space-x-2">
        <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-ping" />
        <Typography variant="code" className="text-xs text-outline-variant">
          Connecting to eBPF Agent telemetry...
        </Typography>
      </div>
    </div>
  );
};
