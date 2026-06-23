import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphGateway } from './graph.gateway';

@Module({
  providers: [GraphService, GraphGateway],
})
export class GraphModule {}
