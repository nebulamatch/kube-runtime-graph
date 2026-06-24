import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GraphModule } from './graph/graph.module';
import { KubeModule } from './kube/kube.module';
import { DebugController } from './debug/debug.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [GraphModule, KubeModule],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
