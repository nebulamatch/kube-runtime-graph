/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Param } from '@nestjs/common';
import { KubeService } from './kube.service';

@Controller('api/kube')
export class KubeController {
  constructor(private readonly kubeService: KubeService) {}

  @Get('contexts')
  getContexts() {
    return this.kubeService.getContexts();
  }

  @Get('contexts/:context/namespaces')
  async getNamespaces(@Param('context') context: string) {
    return this.kubeService.getNamespaces(context);
  }

  @Get('contexts/:context/namespaces/:namespace/pods')
  async getPods(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getPods(context, namespace);
  }
}
