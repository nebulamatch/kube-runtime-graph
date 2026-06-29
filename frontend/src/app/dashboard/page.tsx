'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '../../components/templates/DashboardLayout';
import { useKubeGlobal } from '../../context/KubeContext';
import { Typography } from '../../components/atoms/Typography';
import { apiFetch } from '../../lib/backend';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, Area, AreaChart } from 'recharts';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

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
  const [pods, setPods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!selectedContext || !selectedNamespace) return;
    
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [servicesData, metricsData, podsData] = await Promise.all([
          apiFetch(`/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/services`),
          apiFetch(`/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/metrics`),
          apiFetch(`/kube/contexts/${selectedContext}/namespaces/${selectedNamespace}/pods`)
        ]);

        if (!isMounted) return;

        setServices(servicesData || []);
        
        const newMetrics: Record<string, MetricData> = {};
        (servicesData || []).forEach((svc: any) => {
          newMetrics[svc.name] = (metricsData && metricsData[svc.name]) || {
            rps: 0,
            errorRate: 0,
            p99: 0,
            history: Array(12).fill(0)
          };
        });
        setMetrics(newMetrics);
        setPods(podsData || []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedContext, selectedNamespace]);

  // Enterprise Sparkline using Recharts
  const Sparkline = ({ data, color }: { data: number[], color: string }) => {
    const chartData = data.map((val, i) => ({ value: val, index: i }));
    return (
      <div className="h-16 w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={`color-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Tooltip content={() => null} cursor={false} />
            <Area type="monotone" dataKey="value" stroke={color} fillOpacity={1} fill={`url(#color-${color})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const totalRPS = Object.values(metrics).reduce((sum, m) => sum + m.rps, 0);
  const avgP99 = Object.values(metrics).length > 0 ? Math.round(Object.values(metrics).reduce((sum, m) => sum + m.p99, 0) / Object.values(metrics).length) : 0;
  const degradedCount = Object.values(metrics).filter(m => m.errorRate > 2 || m.p99 > 120).length;

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col p-6 overflow-hidden bg-linear-to-b from-surface to-surface-container-lowest">
        <div className="flex items-center justify-between mb-6">
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

        {/* KPI Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="glass-panel rounded-2xl p-4 flex flex-col">
            <Typography variant="label" className="text-outline-variant mb-1">Total Services</Typography>
            <div className="text-3xl font-bold text-on-surface">{services.length}</div>
          </div>
          <div className="glass-panel rounded-2xl p-4 flex flex-col">
            <Typography variant="label" className="text-outline-variant mb-1">Total RPS</Typography>
            <div className="text-3xl font-bold text-on-surface">{totalRPS}</div>
          </div>
          <div className="glass-panel rounded-2xl p-4 flex flex-col">
            <Typography variant="label" className="text-outline-variant mb-1">Avg P99 Latency</Typography>
            <div className="text-3xl font-bold text-on-surface">{avgP99} ms</div>
          </div>
          <div className={`glass-panel rounded-2xl p-4 flex flex-col ${degradedCount > 0 ? 'border-error/30 bg-error/5' : ''}`}>
            <Typography variant="label" className="text-outline-variant mb-1">Health</Typography>
            <div className="flex items-center gap-2">
              <div className={`text-3xl font-bold ${degradedCount > 0 ? 'text-error' : 'text-emerald-400'}`}>
                {degradedCount > 0 ? `${degradedCount} Degraded` : '100% Healthy'}
              </div>
              {degradedCount > 0 && <WarningAmberIcon className="text-error" />}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-10">
            {services.sort((a, b) => {
              const mA = metrics[a.name];
              const mB = metrics[b.name];
              const scoreA = (mA?.errorRate > 2 || mA?.p99 > 120) ? 1 : 0;
              const scoreB = (mB?.errorRate > 2 || mB?.p99 > 120) ? 1 : 0;
              return scoreB - scoreA;
            }).map((svc) => {
              const metric = metrics[svc.name];
              if (!metric) return null;

              const isDegraded = metric.errorRate > 2 || metric.p99 > 120;
              const statusColor = isDegraded ? '#ffb4ab' : '#34d399'; // error : emerald-400
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

                  <div className="mt-auto pt-4 border-t border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-outline mb-2">Realtime Pod Status</div>
                    <div className="flex flex-wrap gap-2">
                      {pods.filter(pod => {
                         if (svc.selector && Object.keys(svc.selector).length > 0) {
                           return Object.keys(svc.selector).every(k => pod.labels[k] === svc.selector[k]);
                         }
                         return pod.name.startsWith(svc.name);
                      }).map(pod => {
                         let pColor = 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30';
                         const st = pod.status || 'Unknown';
                         if (st === 'Pending' || st === 'ContainerCreating' || st === 'Initializing') pColor = 'bg-amber-400/20 text-amber-400 border-amber-400/30';
                         else if (st === 'Failed' || st === 'CrashLoopBackOff' || st === 'Error') pColor = 'bg-error/20 text-error border-error/30';
                         else if (st !== 'Running') pColor = 'bg-primary/20 text-primary border-primary/30';

                         return (
                           <div key={pod.name} className={`px-2 py-1 rounded border text-[10px] font-medium flex items-center gap-1.5 ${pColor}`} title={pod.name}>
                             <div className={`w-1.5 h-1.5 rounded-full ${pColor.includes('text-emerald') ? 'bg-emerald-400' : pColor.includes('text-error') ? 'bg-error' : pColor.includes('text-amber') ? 'bg-amber-400' : 'bg-primary'}`} />
                             {st}
                           </div>
                         );
                      })}
                      {pods.filter(pod => {
                         if (svc.selector && Object.keys(svc.selector).length > 0) {
                           return Object.keys(svc.selector).every(k => pod.labels[k] === svc.selector[k]);
                         }
                         return pod.name.startsWith(svc.name);
                      }).length === 0 && (
                        <div className="text-xs text-outline italic">No pods running</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
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
