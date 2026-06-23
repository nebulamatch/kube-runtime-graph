import { Module } from '@nestjs/common';
import { KubeService } from './kube.service';
import { KubeController } from './kube.controller';

@Module({
  controllers: [KubeController],
  providers: [KubeService],
  exports: [KubeService],
})
export class KubeModule {}
