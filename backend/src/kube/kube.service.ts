/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';
import * as stream from 'stream';

@Injectable()
export class KubeService {
  getContexts() {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const contexts = kc.getContexts();
      if (contexts.length === 0) {
        return [{ name: 'in-cluster', cluster: 'in-cluster', user: 'service-account' }];
      }
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
      if (contextName && contextName !== 'in-cluster') {
        kc.setCurrentContext(contextName);
      }
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
      if (contextName && contextName !== 'in-cluster') {
        kc.setCurrentContext(contextName);
      }
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

  async streamPodLogs(contextName: string, namespace: string, podName: string, callback: (logLine: string) => void) {
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      if (contextName && contextName !== 'in-cluster') {
        kc.setCurrentContext(contextName);
      }
      const log = new k8s.Log(kc);
      const logStream = new stream.PassThrough();
      logStream.on('data', (chunk) => {
        callback(chunk.toString());
      });
      // follow: true holds the connection open to tail logs
      const req = await log.log(namespace, podName, '', logStream, { follow: true, tailLines: 100, pretty: false, timestamps: false });
      return req;
    } catch (error) {
      console.error(`Failed to stream logs for ${podName}`, error);
      callback(`[System] Failed to stream logs: ${error}`);
      return null;
    }
  }
}
