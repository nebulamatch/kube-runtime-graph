/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ContainerServiceClient } from '@azure/arm-containerservice';
import { TokenCredential, AccessToken } from '@azure/core-auth';
import { SubscriptionClient } from '@azure/arm-subscriptions';

class SimpleTokenCredential implements TokenCredential {
  constructor(private token: string) { }
  async getToken(): Promise<AccessToken> {
    return { token: this.token, expiresOnTimestamp: Date.now() + 3600000 };
  }
}

@Injectable()
export class AzureService {
  private createCredential(token: string): TokenCredential {
    return new SimpleTokenCredential(token);
  }

  async getSubscriptions(token: string) {
    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const client = new SubscriptionClient(this.createCredential(token));
      let subscriptions = [];
      subscriptions.push(client.subscription);
      return subscriptions;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to fetch subscriptions:', err.message);
      // Fallback for local testing if token is invalid
      return [
        { id: 'sub-1', name: 'Production Subscription' },
        { id: 'sub-2', name: 'Development Subscription' },
      ];
    }
  }

  async getClusters(token: string, subscriptionId: string) {
    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const client = new ContainerServiceClient(
        this.createCredential(token),
        subscriptionId,
      );
      const clusters = [];
      for await (const cluster of client.managedClusters.list()) {
        clusters.push({
          id: cluster.id as string,
          name: cluster.name as string,
          resourceGroup: cluster.id?.split('/')[4] as string,
        });
      }
      return clusters;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to fetch clusters:', err.message);
      // Fallback for local testing
      return [
        { id: 'cluster-1', name: 'aks-prod-eus', resourceGroup: 'rg-prod' },
        { id: 'cluster-2', name: 'aks-dev-eus', resourceGroup: 'rg-dev' },
      ];
    }
  }

  async getNamespaces(
    _token: string,
    _subscriptionId: string,
    _resourceGroup: string,
    _clusterName: string,
  ) {
    return Promise.resolve([
      { name: 'default' },
      { name: 'kube-system' },
      { name: 'ingress-nginx' },
      { name: 'payments-prod' },
    ]);
  }

  async getPods(
    _token: string,
    _subscriptionId: string,
    _resourceGroup: string,
    _clusterName: string,
    namespace: string,
  ) {
    return Promise.resolve([
      {
        name: 'frontend-deployment-7f9b8c6d4-abc12',
        status: 'Running',
        namespace,
      },
      { name: 'payment-service-5c4d3b2a1-xyz89', status: 'Running', namespace },
      { name: 'auth-api-8e7d6c5b4-def34', status: 'Running', namespace },
    ]);
  }
}
