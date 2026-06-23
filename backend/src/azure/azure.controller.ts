import { Controller, Get, Param, Headers } from '@nestjs/common';
import { AzureService } from './azure.service';

@Controller('api/azure')
export class AzureController {
  constructor(private readonly azureService: AzureService) {}

  @Get('subscriptions')
  async getSubscriptions(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '');
    return this.azureService.getSubscriptions(token);
  }

  @Get('subscriptions/:subId/clusters')
  async getClusters(
    @Headers('authorization') auth: string,
    @Param('subId') subId: string,
  ) {
    const token = auth?.replace('Bearer ', '');
    return this.azureService.getClusters(token, subId);
  }

  @Get(
    'subscriptions/:subId/resourceGroups/:rg/clusters/:clusterName/namespaces',
  )
  async getNamespaces(
    @Headers('authorization') auth: string,
    @Param('subId') subId: string,
    @Param('rg') rg: string,
    @Param('clusterName') clusterName: string,
  ) {
    const token = auth?.replace('Bearer ', '');
    return this.azureService.getNamespaces(token, subId, rg, clusterName);
  }

  @Get(
    'subscriptions/:subId/resourceGroups/:rg/clusters/:clusterName/namespaces/:namespace/pods',
  )
  async getPods(
    @Headers('authorization') auth: string,
    @Param('subId') subId: string,
    @Param('rg') rg: string,
    @Param('clusterName') clusterName: string,
    @Param('namespace') namespace: string,
  ) {
    const token = auth?.replace('Bearer ', '');
    return this.azureService.getPods(token, subId, rg, clusterName, namespace);
  }
}
