'use client';

import React from 'react';
import { Typography } from '../atoms/Typography';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useKubeGlobal } from '../../context/KubeContext';
import { io } from 'socket.io-client';
import { socketUrl } from '../../lib/backend';
import { useRouter } from 'next/navigation';

export const TopNav: React.FC = () => {
  const {
    contexts,
    namespaces,
    selectedContext,
    selectedNamespace,
    setSelectedContext,
    setSelectedNamespace,
    loadingContexts,
    loadingNamespaces,
  } = useKubeGlobal();

  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const router = useRouter();

  // Connect to websocket for live notifications
  React.useEffect(() => {
    const socket = io(socketUrl as string, { path: '/socket.io/' });
    
    socket.on('notification', (notif: any) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleContextChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedContext(e.target.value);
  };

  const handleNamespaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedNamespace(e.target.value);
  };

  return (
    <header className="h-16 border-b border-white/5 bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-between px-6 z-30">
      <div className="flex items-center space-x-6">
        {/* Cluster Selector */}
        <div className="flex flex-col relative group">
          <Typography variant="label" className="!text-[9px] text-outline-variant mb-0.5">Cluster</Typography>
          <div className="relative">
            <select 
              className="appearance-none bg-transparent text-sm font-medium text-on-surface focus:outline-none cursor-pointer pr-5 hover:text-primary transition-colors z-10 relative"
              value={selectedContext}
              onChange={handleContextChange}
              disabled={loadingContexts}
            >
              {loadingContexts && <option>Loading...</option>}
              {!loadingContexts && contexts.length === 0 && <option>No contexts</option>}
              {contexts.map(ctx => (
                <option key={ctx.name} value={ctx.name} className="bg-surface-container-high text-on-surface">{ctx.name}</option>
              ))}
            </select>
            <KeyboardArrowDownIcon fontSize="small" className="text-outline absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="w-[1px] h-8 bg-white/5" />

        {/* Namespace Selector */}
        <div className="flex flex-col relative">
          <Typography variant="label" className="!text-[9px] text-outline-variant mb-0.5">Namespace</Typography>
          <div className="relative">
            <select 
              className="appearance-none bg-transparent text-sm font-medium text-on-surface focus:outline-none cursor-pointer pr-5 hover:text-primary transition-colors z-10 relative"
              value={selectedNamespace}
              onChange={handleNamespaceChange}
              disabled={loadingNamespaces}
            >
              {loadingNamespaces && <option>Loading...</option>}
              {!loadingNamespaces && namespaces.length === 0 && <option>No namespaces</option>}
              {namespaces.map(ns => (
                <option key={ns.name} value={ns.name} className="bg-surface-container-high text-on-surface">{ns.name}</option>
              ))}
            </select>
            <KeyboardArrowDownIcon fontSize="small" className="text-outline absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Search */}
        <div className="relative">
          <SearchIcon fontSize="small" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-outline" />
          <input 
            type="text" 
            placeholder="Search pods, services..." 
            className="bg-surface-container-low border border-white/5 rounded-full pl-9 pr-4 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-[240px] transition-all"
          />
        </div>

        <div className="w-[1px] h-6 bg-white/5 mx-2" />
        
        <div className="relative" ref={dropdownRef}>
          <button 
            className={`transition-colors relative p-1.5 rounded-full ${isNotificationsOpen ? 'bg-white/10 text-on-surface' : 'text-outline hover:text-on-surface hover:bg-white/5'}`}
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          >
            {isNotificationsOpen ? <NotificationsActiveIcon fontSize="small" /> : <NotificationsNoneIcon fontSize="small" />}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border border-surface-container-lowest" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-3 w-80 rounded-2xl glass-panel shadow-2xl border border-white/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between p-4 border-b border-white/5 bg-surface-container-low/50">
                <Typography variant="label" className="text-on-surface font-semibold">Notifications</Typography>
                <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary-fixed text-[10px] font-bold">3 NEW</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.map(notif => (
                  <div key={notif.id} onClick={() => {
                    setIsNotificationsOpen(false);
                    // if it has a service name, navigate to dashboard to see it
                    router.push('/dashboard');
                  }} className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-full ${
                        notif.type === 'error' ? 'bg-error/15 text-error' :
                        notif.type === 'warning' ? 'bg-amber-400/15 text-amber-400' :
                        'bg-sky-400/15 text-sky-400'
                      }`}>
                        <WarningAmberIcon fontSize="small" style={{ fontSize: '16px' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <Typography variant="label" className="text-on-surface font-semibold truncate pr-2">{notif.title}</Typography>
                          <span className="text-[10px] text-outline-variant flex-shrink-0">{notif.time || 'Just now'}</span>
                        </div>
                        <Typography variant="body" className="text-xs text-outline-variant line-clamp-2">{notif.message}</Typography>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 text-center border-t border-white/5 bg-surface-container-low/30 hover:bg-white/5 cursor-pointer transition-colors">
                <Typography variant="label" className="text-primary-fixed text-[11px] font-semibold uppercase tracking-wider">
                  Mark all as read
                </Typography>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
