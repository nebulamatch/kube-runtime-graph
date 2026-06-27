/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Get, Param, Delete, Post, Body } from '@nestjs/common';
import { KubeService } from './kube.service';
import { ApiEventsStore } from '../telemetry/api-events.store';

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

  @Get('contexts/:context/namespaces/:namespace/services')
  async getServices(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getServices(context, namespace);
  }

  @Get('contexts/:context/namespaces/:namespace/events')
  async getEvents(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getEvents(context, namespace);
  }

  @Get('contexts/:context/namespaces/:namespace/api-traces')
  async getApiTraces(
    @Param('context') _context: string,
    @Param('namespace') namespace: string,
  ) {
    return ApiEventsStore.listServiceTracesByNamespace(namespace, 300);
  }

  @Get('contexts/:context/namespaces/:namespace/rbac')
  async getRbac(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
  ) {
    return this.kubeService.getRbac(context, namespace);
  }

  @Delete('contexts/:context/namespaces/:namespace/services/:service')
  async deleteService(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('service') serviceName: string,
  ) {
    return this.kubeService.deleteService(context, namespace, serviceName);
  }

  @Delete('contexts/:context/namespaces/:namespace/pods/:pod')
  async deletePod(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
  ) {
    return this.kubeService.deletePod(context, namespace, podName);
  }

  @Post('contexts/:context/namespaces/:namespace/pods/:pod/exec')
  async execCommand(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
    @Body('command') command: string,
  ) {
    return this.kubeService.execCommand(context, namespace, podName, command);
  }

  @Post('contexts/:context/namespaces/:namespace/pods/:pod/portforward')
  async portForward(
    @Param('context') context: string,
    @Param('namespace') namespace: string,
    @Param('pod') podName: string,
    @Body('targetPort') targetPort: number,
  ) {
    return this.kubeService.portForward(context, namespace, podName, targetPort);
  }
}
