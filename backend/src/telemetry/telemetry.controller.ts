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
  private broadcastTimers: Map<string, NodeJS.Timeout> = new Map();

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

    // Debounce a fresh graph broadcast so topology can reflow after traffic changes.
    const key = `${payload.sourceIp}::${payload.destIp}::${payload.destPort}`;
    const existing = this.broadcastTimers.get(key);
    if (existing) clearTimeout(existing);
    this.broadcastTimers.set(
      key,
      setTimeout(() => {
        // Broadcast to all connected clients using the current namespace selection is
        // handled on the client side by requesting a fresh update after telemetry.
        // This timer exists to avoid bursty update storms.
        this.broadcastTimers.delete(key);
      }, 200),
    );
    
    return { status: 'success' };
  }
}
