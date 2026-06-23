import { Module } from '@nestjs/common';
import { KubeService } from './kube.service';
import { KubeController } from './kube.controller';

@Module({
  controllers: [KubeController],
  providers: [KubeService],
})
export class KubeModule {}
