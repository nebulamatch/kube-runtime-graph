import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphGateway } from './graph.gateway';
import { TelemetryController } from '../telemetry/telemetry.controller';

@Module({
  controllers: [TelemetryController],
  providers: [GraphService, GraphGateway],
})
export class GraphModule {}
