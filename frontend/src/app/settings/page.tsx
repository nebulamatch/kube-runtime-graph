'use client';

import React, { useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { Typography } from '../../components/atoms/Typography';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function SettingsPage() {
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [simulatedTraffic, setSimulatedTraffic] = useState(false);
  const [ebpfMode, setEbpfMode] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
              Settings
            </Typography>
            <Typography variant="body" className="text-on-surface-variant text-sm mt-1">
              Configure metrics aggregation, polling intervals, and display modes
            </Typography>
          </div>

          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-on-primary font-medium rounded-lg hover:bg-primary-container transition-colors shadow-md"
          >
            {saved ? (
              <>
                <CheckCircleIcon fontSize="small" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <SaveIcon fontSize="small" />
                <span>Save Config</span>
              </>
            )}
          </button>
        </div>

        {/* Form Container */}
        <div className="space-y-6 overflow-y-auto pr-2 terminal-scroll">
          {/* Section: General */}
          <div className="glass-panel rounded-xl p-6 space-y-6">
            <Typography variant="h2" className="text-base font-semibold border-b border-white/5 pb-3 text-primary-fixed">
              Overview Layout Settings
            </Typography>

            <div className="flex flex-col space-y-2">
              <label className="text-sm text-on-surface font-medium">Topology Auto-Refresh Interval</label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="bg-surface-container border border-white/5 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
              >
                <option value="2">High Dynamic (2 seconds)</option>
                <option value="5">Standard Refresh (5 seconds)</option>
                <option value="10">Power Saving (10 seconds)</option>
                <option value="30">Aggregated (30 seconds)</option>
              </select>
              <span className="text-xs text-outline">How frequently the topology graph queries Kubernetes state APIs.</span>
            </div>
          </div>

          {/* Section: External Gateways */}
          <div className="glass-panel rounded-xl p-6 space-y-6">
            <Typography variant="h2" className="text-base font-semibold border-b border-white/5 pb-3 text-primary-fixed">
              External Gateways
            </Typography>

            <div className="flex flex-col space-y-2">
              <label className="text-sm text-on-surface font-medium">Known Gateway IPs / Hosts</label>
              <input
                type="text"
                placeholder="discountwishcountapim.azure-api.net, 10.0.0.1"
                className="bg-surface-container border border-white/5 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary w-full"
              />
              <span className="text-xs text-outline">Comma-separated list of external hosts or IPs that should be tracked as named Gateway nodes.</span>
            </div>
          </div>

          {/* Section: Telemetry */}
          <div className="glass-panel rounded-xl p-6 space-y-6">
            <Typography variant="h2" className="text-base font-semibold border-b border-white/5 pb-3 text-primary-fixed">
              Telemetry & eBPF Options
            </Typography>

            {/* Toggle: eBPF mode */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col space-y-1">
                <label className="text-sm text-on-surface font-medium">Kernel eBPF Telemetry</label>
                <span className="text-xs text-outline">Stream raw network connections from the host using kernel probes.</span>
              </div>
              <button 
                onClick={() => setEbpfMode(!ebpfMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  ebpfMode ? 'bg-primary' : 'bg-surface-container-highest border border-white/5'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  ebpfMode ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Toggle: Traffic simulator */}
            <div className="flex items-center justify-between border-t border-white/5 pt-6">
              <div className="flex flex-col space-y-1">
                <label className="text-sm text-on-surface font-medium">Simulated Test Traffic</label>
                <span className="text-xs text-outline">Generate mock HTTP and TCP service traffic nodes when idle.</span>
              </div>
              <button 
                onClick={() => setSimulatedTraffic(!simulatedTraffic)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  simulatedTraffic ? 'bg-primary' : 'bg-surface-container-highest border border-white/5'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  simulatedTraffic ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
