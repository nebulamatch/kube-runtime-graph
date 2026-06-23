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
  constructor(
    private readonly graphService: GraphService,
    private readonly graphGateway: GraphGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveTelemetry(@Body() payload: TelemetryPayload) {
    if (!payload.sourceIp || !payload.destIp) return { status: 'ignored' };

    // Ask GraphService to map these IPs to an Edge
    const edge = await this.graphService.processTelemetry(payload);
    
    // Broadcast the new Edge to the connected React Flow clients
    if (edge) {
      this.graphGateway.server.emit('telemetryUpdate', edge);
    }
    
    return { status: 'success' };
  }
}
