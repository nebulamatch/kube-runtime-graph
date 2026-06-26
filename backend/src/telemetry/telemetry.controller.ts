import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { GraphGateway } from '../graph/graph.gateway';
import { ApiEventsStore } from './api-events.store';

export interface TelemetryPayload {
  sourceIp: string;
  destIp: string;
  destPort: number;
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  statusCode?: number;
  responseBody?: string;
  durationMs?: number;
}

interface TelemetryAnalysis {
  severity: 'info' | 'warning' | 'error';
  summary: string;
  suggestion?: string;
}

@Controller('api/telemetry')
export class TelemetryController {
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly graphService: GraphService,
    private readonly graphGateway: GraphGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveTelemetry(@Body() payload: TelemetryPayload) {
    if (!payload.sourceIp || !payload.destIp) return { status: 'ignored' };

    // Ask GraphService to map these IPs to an Edge
    const result = await this.graphService.processTelemetry(payload);
    // Enqueue the result to GraphGateway for buffered/batched emission to clients
    if (result) {
      try {
        this.graphGateway.enqueueTelemetry(result);
      } catch (e) {
        // fallback to immediate emit when enqueue not available
        this.graphGateway.server.emit('telemetryUpdate', result);
      }
    }

    // Persist API traces for Events page (namespace-scoped)
    try {
      const resultData: any = result || {};
      const sourceService = resultData?.sourceServiceId
        ? String(resultData.sourceServiceId).replace('svc-', '')
        : undefined;
      const destService = resultData?.destServiceId
        ? String(resultData.destServiceId).replace('svc-', '')
        : undefined;
      const sourcePod = resultData?.sourcePodId
        ? String(resultData.sourcePodId).replace('pod-', '')
        : undefined;
      const destPod = resultData?.destPodId
        ? String(resultData.destPodId).replace('pod-', '')
        : undefined;

      // Best-effort namespace attribution: use destination side when possible.
      const namespace = resultData?.destNamespace || resultData?.sourceNamespace || 'default';

      const endpoint = payload.url || (resultData?.edge?.data?.endpoint as string | undefined) || (payload.method && payload.path ? `${payload.method} ${payload.path}` : undefined);
      const hasServiceContext = !!(sourceService || destService);
      const hasTraceContext = !!(payload.method || payload.path || payload.url || payload.headers || payload.statusCode || endpoint);

      if (hasServiceContext || hasTraceContext) {
        // compute a small analysis summary to help triage on the Events UI
        const analysis: TelemetryAnalysis | undefined = ((): TelemetryAnalysis | undefined => {
          if (payload?.statusCode && payload.statusCode >= 500) {
            return { severity: 'error', summary: `Server error ${payload.statusCode}`, suggestion: 'Check destination pod logs, inspect application errors and recent deployments.' };
          }
          if (payload?.statusCode && payload.statusCode >= 400) {
            if (payload.statusCode === 401 || payload.statusCode === 403) {
              return { severity: 'warning', summary: `Auth error ${payload.statusCode}`, suggestion: 'Verify authentication tokens/headers and RBAC.' };
            }
            if (payload.statusCode === 429) {
              return { severity: 'warning', summary: 'Rate limited (429)', suggestion: 'Consider throttling clients or increasing quota.' };
            }
            return { severity: 'warning', summary: `Client error ${payload.statusCode}`, suggestion: 'Inspect request parameters and client headers.' };
          }
          if (payload?.durationMs && payload.durationMs > 2000) {
            return { severity: 'warning', summary: `Slow response ${payload.durationMs}ms`, suggestion: 'Investigate downstream latency, DB or network slow paths.' };
          }
          if (payload?.statusCode === undefined && !payload?.responseBody && !payload?.responseHeaders) {
            return undefined;
          }
          return { severity: 'info', summary: 'OK' };
        })();

        ApiEventsStore.add({
          id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          namespace,
          method: payload.method,
          path: payload.path,
          url: payload.url || payload.path,
          endpoint,
          headers: payload.headers,
          responseHeaders: (payload as any).responseHeaders,
          statusCode: payload.statusCode,
          responseBody: payload.responseBody,
          durationMs: payload.durationMs,
          sourceIp: payload.sourceIp,
          destIp: payload.destIp,
          destPort: payload.destPort,
          sourceService,
          destService,
          sourcePod,
          destPod,
          analysis,
        });
      }
    } catch {
      // best-effort only
    }

    // If topology changed (new service relationship), broadcast a fresh graph
    // to currently connected clients so hierarchy/positions can reflow.
    const topologyChanged = !!(result && (result as any).topologyChanged);
    if (topologyChanged) {
      if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
      this.broadcastTimer = setTimeout(async () => {
        try {
          await this.graphGateway.broadcastFreshGraphToMatchingClients();
        } catch {
          // best-effort only
        }
      }, 250);
    }
    
    return { status: 'success' };
  }
}
