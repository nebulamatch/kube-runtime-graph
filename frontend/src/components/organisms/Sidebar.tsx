'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Typography } from '../atoms/Typography';
import { NavMenuItem } from '../molecules/NavMenuItem';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ListAltIcon from '@mui/icons-material/ListAlt';
import TerminalIcon from '@mui/icons-material/Terminal';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-surface-container-lowest border-r border-white/5 flex flex-col z-40">
      <div className="flex items-center px-6 py-6 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-on-primary mr-3 shadow-[0_0_15px_rgba(173,198,255,0.3)]">
          <DashboardIcon fontSize="small" />
        </div>
        <Typography variant="h2" className="text-on-surface">
          KubeGraph
        </Typography>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <Typography variant="label" className="px-4 mb-3 text-outline-variant">
          Observability
        </Typography>
        <NavMenuItem href="/" label="Topology Graph" icon={<DashboardIcon fontSize="small" />} isActive={pathname === '/'} />
        <NavMenuItem href="/dashboard" label="Metrics Dashboard" icon={<ListAltIcon fontSize="small" />} isActive={pathname === '/dashboard'} />
        <NavMenuItem href="/events" label="API Events" icon={<ListAltIcon fontSize="small" />} isActive={pathname === '/events'} />
        <NavMenuItem href="/logs" label="Log Management" icon={<TerminalIcon fontSize="small" />} isActive={pathname === '/logs'} />
        
        <div className="my-6" />
        
        <Typography variant="label" className="px-4 mb-3 text-outline-variant">
          Management
        </Typography>
        <NavMenuItem href="/rbac" label="Access Control" icon={<SecurityIcon fontSize="small" />} isActive={pathname === '/rbac'} />
        <NavMenuItem href="/settings" label="Settings" icon={<SettingsIcon fontSize="small" />} isActive={pathname === '/settings'} />
      </div>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center space-x-3 px-2 py-2">
          <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-outline">
            U
          </div>
          <div>
            <Typography variant="h3" className="text-sm">Admin User</Typography>
            <Typography variant="label" className="!text-[10px] text-accent-green">Cluster Admin</Typography>
          </div>
        </div>
      </div>
    </aside>
  );
};
