'use client';

import React from 'react';
import { Typography } from '../atoms/Typography';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { useKubeGlobal } from '../../context/KubeContext';

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
        
        <button className="text-outline hover:text-on-surface transition-colors relative">
          <NotificationsNoneIcon fontSize="small" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full border border-surface-container-lowest" />
        </button>
      </div>
    </header>
  );
};
