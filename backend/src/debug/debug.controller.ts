import { Controller, Get } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';

@Controller('api/debug')
export class DebugController {
  constructor(private readonly graphService: GraphService) {}

  @Get('active-edges')
  getActiveEdges() {
    return this.graphService.getActiveEdges();
  }
}
