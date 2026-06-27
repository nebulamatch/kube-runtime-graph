/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Param, Delete, Post, Body } from '@nestjs/common';
import { KubeService } from './kube.service';
import { ApiEventsStore } from '../telemetry/api-events.store';

@Controller('api/kube')
export class KubeController {
  constructor(private readonly kubeService: KubeService) {}

  @Get('contexts')
  getContexts() {
    return this.kubeService.getContexts();
  }

  @Get('contexts/:context/namespaces')
  async getNamespaces(@Param('context') context: string) {
    return this.kubeService.getNamespaces(context);
  }

  @Get('contexts/:context/namespaces/:namespace/pods')
  async getPods(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getPods(context, namespace);
  }

  @Get('contexts/:context/namespaces/:namespace/services')
  async getServices(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getServices(context, namespace);
  }

  @Get('contexts/:context/namespaces/:namespace/events')
  async getEvents(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getEvents(context, namespace);
  }

  @Get('contexts/:context/namespaces/:namespace/api-traces')
  async getApiTraces(
    @Param('context') _context: string,
    @Param('namespace') namespace: string,
  ) {
    return ApiEventsStore.listServiceTracesByNamespace(namespace, 300);
  }

  @Get('contexts/:context/namespaces/:namespace/metrics')
  async getMetrics(
    @Param('context') _context: string,
    @Param('namespace') namespace: string,
  ) {
    const traces = ApiEventsStore.listByNamespace(namespace, 5000);
    const metrics: Record<string, any> = {};
    const now = Date.now();
    
    traces.forEach(t => {
      const svc = t.destService;
      if (!svc) return;
      if (!metrics[svc]) {
        metrics[svc] = { rps: 0, errorRate: 0, p99: 0, history: Array(12).fill(0) };
      }
    });

    Object.keys(metrics).forEach(svc => {
      const svcTraces = traces.filter(t => t.destService === svc);
      if (svcTraces.length === 0) return;
      
      const errors = svcTraces.filter(t => (t.statusCode || 0) >= 400).length;
      metrics[svc].errorRate = Math.round((errors / svcTraces.length) * 100);
      
      const durations = svcTraces.map(t => t.durationMs || 0).sort((a, b) => a - b);
      const p99Index = Math.floor(durations.length * 0.99);
      metrics[svc].p99 = durations[p99Index] || 0;
      
      const oneMinuteAgo = now - 60000;
      const recentTraces = svcTraces.filter(t => new Date(t.timestamp).getTime() > oneMinuteAgo);
      // Let's ensure RPS is at least 0. If recentTraces is tiny, RPS is tiny. 
      // Instead of dividing by 60 strictly (which gives 0 for < 60 reqs), let's just do a simple rate.
      // E.g. if we have 5 traces in 60 seconds, RPS = 0.08, but we show integer. Let's just scale.
      metrics[svc].rps = Math.max(0, Math.round(recentTraces.length / 60));

      for (let i = 0; i < 12; i++) {
        const bucketStart = now - (12 - i) * 5000;
        const bucketEnd = bucketStart + 5000;
        const bucketTraces = svcTraces.filter(t => {
          const ts = new Date(t.timestamp).getTime();
          return ts >= bucketStart && ts < bucketEnd;
        });
        metrics[svc].history[i] = bucketTraces.length;
      }
    });

    return metrics;
  }

  @Get('contexts/:context/namespaces/:namespace/rbac')
  async getRbac(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getRbac(context, namespace);
  }

  @Delete('contexts/:context/namespaces/:namespace/services/:service')
  async deleteService(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('service') serviceName: string,
  ) {
    return this.kubeService.deleteService(context, namespace, serviceName);
  }

  @Delete('contexts/:context/namespaces/:namespace/pods/:pod')
  async deletePod(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
  ) {
    return this.kubeService.deletePod(context, namespace, podName);
  }

  @Post('contexts/:context/namespaces/:namespace/pods/:pod/exec')
  async execCommand(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
    @Body('command') command: string,
  ) {
    return this.kubeService.execCommand(context, namespace, podName, command);
  }

  @Post('contexts/:context/namespaces/:namespace/pods/:pod/portforward')
  async portForward(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
    @Body('targetPort') targetPort: number,
  ) {
    return this.kubeService.portForward(context, namespace, podName, targetPort);
  }
}
