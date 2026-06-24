import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphGateway } from './graph.gateway';
import { TelemetryController } from '../telemetry/telemetry.controller';
import { DebugController } from '../debug/debug.controller';
import { KubeModule } from '../kube/kube.module';

@Module({
  imports: [KubeModule],
  controllers: [TelemetryController, DebugController],
  providers: [GraphService, GraphGateway],
  exports: [GraphService],
})
export class GraphModule {}
