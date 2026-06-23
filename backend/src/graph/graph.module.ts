import { Module } from '@nestjs/common';
import { GraphService } from './graph.service';
import { GraphGateway } from './graph.gateway';
import { TelemetryController } from '../telemetry/telemetry.controller';
import { KubeModule } from '../kube/kube.module';

@Module({
  imports: [KubeModule],
  controllers: [TelemetryController],
  providers: [GraphService, GraphGateway],
})
export class GraphModule {}
