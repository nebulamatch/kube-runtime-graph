/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

@Injectable()
export class KubeService {
  getContexts() {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const contexts = kc.getContexts();
      return contexts.map((c) => ({
        name: c.name,
        cluster: c.cluster,
        user: c.user,
      }));
    } catch (error) {
      console.error('Failed to load contexts from kubeconfig', error);
      return [];
    }
  }

  async getNamespaces(contextName: string) {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      kc.setCurrentContext(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      const res: any = await k8sApi.listNamespace();
      const items = res.body ? res.body.items : res.items;
      return items.map((ns: any) => ({ name: ns.metadata?.name }));
    } catch (error: any) {
      console.error('Failed to list namespaces', error);
      throw new HttpException(
        `Failed to list namespaces: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPods(contextName: string, namespace: string) {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      kc.setCurrentContext(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      const res: any = await k8sApi.listNamespacedPod(namespace);
      const items = res.body ? res.body.items : res.items;
      return items.map((pod: any) => ({
        name: pod.metadata?.name,
        status: pod.status?.phase,
        namespace: pod.metadata?.namespace,
      }));
    } catch (error: any) {
      console.error('Failed to list pods', error);
      throw new HttpException(
        `Failed to list pods: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
