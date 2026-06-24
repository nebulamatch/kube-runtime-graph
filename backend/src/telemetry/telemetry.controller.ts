import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { GraphGateway } from '../graph/graph.gateway';

export interface TelemetryPayload {
  sourceIp: string;
  destIp: string;
  destPort: number;
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
