'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import { apiFetch } from '../../lib/backend';
import StorageIcon from '@mui/icons-material/Storage';
import SpeedIcon from '@mui/icons-material/Speed';
import ApiIcon from '@mui/icons-material/Api';
import MemoryIcon from '@mui/icons-material/Memory';
import { Activity } from 'lucide-react';

interface MetricData {
  rps: number;
  errorRate: number;
  p99: number;
  history: number[];
}

export default function Dashboard() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [services, setServices] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricData>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;
    
    const fetchServices = async () => {
      setIsLoading(true);
      try {
        const data = await apiFetch(`/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/services`);
        setServices(data || []);
        
        try {
          const metricsData = await apiFetch(`/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/metrics`);
          // Ensure every service has at least empty metrics if none returned
          const newMetrics: Record<string, MetricData> = {};
          (data || []).forEach((svc: any) => {
            newMetrics[svc.name] = metricsData[svc.name] || {
              rps: 0,
              errorRate: 0,
              p99: 0,
              history: Array(12).fill(0)
            };
          });
          setMetrics(newMetrics);
        } catch (metricsErr) {
          console.error('Failed to load metrics', metricsErr);
          // Fallback to empty if error
          const newMetrics: Record<string, MetricData> = {};
          (data || []).forEach((svc: any) => {
            newMetrics[svc.name] = { rps: 0, errorRate: 0, p99: 0, history: Array(12).fill(0) };
          });
          setMetrics(newMetrics);
        }
      } catch (err) {
        console.error('Failed to load services', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchServices();
  }, [selectedContext, selectedNamespace]);

  // Mini Sparkline component
  const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    const max = Math.max(...data, 100);
    return (
      <div className="flex items-end h-12 gap-0.5">
        {data.map((val, i) => (
          <div 
            key={i} 
            className={`flex-1 rounded-t-sm opacity-80`}
            style={{ height: `${(val / max) * 100}%`, backgroundColor: color }}
          />
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden bg-linear-to-b from-surface to-surface-container-lowest">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Typography variant="h1" className="text-2xl font-bold tracking-tight text-on-surface">
                Metrics Dashboard
              </Typography>
            </div>
            <Typography variant="body" className="text-on-surface-variant text-sm">
              Real-time service health and performance in <span className="text-primary font-medium">{selectedNamespace}</span>
            </Typography>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-10">
            {services.map((svc) => {
              const metric = metrics[svc.name];
              if (!metric) return null;

              const isDegraded = metric.errorRate > 2 || metric.p99 > 120;
              const statusColor = isDegraded ? 'var(--color-error)' : 'var(--color-emerald-400)';
              const statusBg = isDegraded ? 'bg-error/10 border-error/30' : 'bg-surface-container/60 border-white/6';
              const statusText = isDegraded ? 'text-error' : 'text-emerald-400';

              return (
                <div key={svc.name} className={`rounded-2xl border px-5 py-4 shadow-lg shadow-black/10 transition-colors ${statusBg}`}>
                  <div className="flex items-center justify-between mb-4">
                    <Typography variant="h3" className="font-semibold text-on-surface truncate pr-2">
                      {svc.name}
                    </Typography>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${isDegraded ? 'bg-error/20 text-error' : 'bg-emerald-400/20 text-emerald-400'}`}>
                      {isDegraded ? 'Degraded' : 'Healthy'}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-outline mb-1">RPS</div>
                      <div className="text-lg font-medium text-on-surface">{metric.rps}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-outline mb-1">P99</div>
                      <div className="text-lg font-medium text-on-surface">{metric.p99}ms</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-outline mb-1">Errors</div>
                      <div className={`text-lg font-medium ${statusText}`}>{metric.errorRate}%</div>
                    </div>
                  </div>

                  <div className="mt-2 pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-outline mb-2">Traffic Trend</div>
                    <Sparkline data={metric.history} color={statusColor} />
                  </div>
                </div>
              );
            })}
            
            {services.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 rounded-2xl border border-white/10 border-dashed bg-white/5">
                <Typography variant="body" className="text-outline-variant mb-2">No services found in this namespace.</Typography>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
