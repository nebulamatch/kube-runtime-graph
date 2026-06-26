/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';
import * as stream from 'stream';

interface CacheEntry<T> {
  ts: number;
  data: T;
}

@Injectable()
export class KubeService {
  // In-memory caches with TTL
  private eventCache: Map<string, CacheEntry<any[]>> = new Map();
  private podsCache: Map<string, CacheEntry<any[]>> = new Map();
  private servicesCache: Map<string, CacheEntry<any[]>> = new Map();
  private readonly eventCacheTtlMs = 5000; // 5 seconds
  private readonly podsCacheTtlMs = 5000; // 5 seconds
  private readonly servicesCacheTtlMs = 5000; // 5 seconds
  private loadConfig(contextName?: string): k8s.KubeConfig {
    const kc = new k8s.KubeConfig();
    if (process.env.KUBERNETES_SERVICE_HOST) {
      kc.loadFromCluster();
    } else {
      kc.loadFromDefault();
      if (contextName && contextName !== 'in-cluster' && contextName !== 'inClusterContext') {
        try {
          kc.setCurrentContext(contextName);
        } catch (e) {
          console.warn(`Failed to set context ${contextName}, using default`);
        }
      }
    }
    return kc;
  }

  getContexts() {
    try {
      const kc = new k8s.KubeConfig();
      if (process.env.KUBERNETES_SERVICE_HOST) {
        kc.loadFromCluster();
      } else {
        kc.loadFromDefault();
      }
      const contexts = kc.getContexts();
      if (contexts.length === 0 || process.env.KUBERNETES_SERVICE_HOST) {
        return [{ name: 'inClusterContext', cluster: 'inCluster', user: 'inClusterUser' }];
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
      const kc = this.loadConfig(contextName);
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
      const cacheKey = `${contextName}::${namespace}`;
      const cached = this.podsCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < this.podsCacheTtlMs) {
        return cached.data;
      }

      const kc = this.loadConfig(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      const res: any = await k8sApi.listNamespacedPod(namespace);
      const items = res.body ? res.body.items : res.items;
      const pods = items.map((pod: any) => ({
        name: pod.metadata?.name,
        status: pod.status?.phase,
        namespace: pod.metadata?.namespace,
        ip: pod.status?.podIP,
        nodeName: pod.spec?.nodeName,
        restarts: Array.isArray(pod.status?.containerStatuses)
          ? pod.status.containerStatuses.reduce((sum: number, container: any) => sum + (container.restartCount || 0), 0)
          : 0,
        readyContainers: Array.isArray(pod.status?.containerStatuses)
          ? pod.status.containerStatuses.filter((container: any) => container.ready).length
          : 0,
        totalContainers: Array.isArray(pod.spec?.containers) ? pod.spec.containers.length : 0,
        labels: pod.metadata?.labels || {},
        createdAt: pod.metadata?.creationTimestamp,
      }));

      this.podsCache.set(cacheKey, { ts: Date.now(), data: pods });
      return pods;
    } catch (error: any) {
      console.error('Failed to list pods', error);
      throw new HttpException(
        `Failed to list pods: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getServices(contextName: string, namespace: string) {
    try {
      const cacheKey = `${contextName}::${namespace}::services`;
      const cached = this.servicesCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < this.servicesCacheTtlMs) {
        return cached.data;
      }

      const kc = this.loadConfig(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      const res: any = await k8sApi.listNamespacedService(namespace);
      const items = res.body ? res.body.items : res.items;
      const services = items.map((s: any) => ({
        name: s.metadata?.name,
        namespace: s.metadata?.namespace,
        type: s.spec?.type,
        selector: s.spec?.selector || {},
      }));

      this.servicesCache.set(cacheKey, { ts: Date.now(), data: services });
      return services;
    } catch (error: any) {
      console.error('Failed to list services', error);
      throw new HttpException(
        `Failed to list services: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async streamPodLogs(contextName: string, namespace: string, podName: string, callback: (logLine: string) => void) {
    try {
      const kc = this.loadConfig(contextName);
      const log = new k8s.Log(kc);
      const logStream = new stream.PassThrough();
      logStream.on('data', (chunk) => {
        callback(chunk.toString());
      });
      // follow: true holds the connection open to tail logs.
      // Use a small historical window so the UI sees recent activity quickly,
      // even when the pod was already emitting logs before subscription.
      const req = await log.log(namespace, podName, '', logStream, {
        follow: true,
        tailLines: 200,
        sinceSeconds: 300,
        pretty: false,
        timestamps: true,
      });
      return req;
    } catch (error) {
      console.error(`Failed to stream logs for ${podName}`, error);
      callback(`[System] Failed to stream logs: ${error}`);
      return null;
    }
  }

  async getEvents(contextName: string, namespace: string) {
    try {
      const cacheKey = `${contextName}::${namespace}`;
      const cached = this.eventCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < this.eventCacheTtlMs) {
        return cached.data;
      }

      const kc = this.loadConfig(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      const res: any = await k8sApi.listNamespacedEvent(namespace);
      let items = res.body ? res.body.items : res.items;

      // Sort by timestamp descending and take most recent 100
      items = items
        .sort((a: any, b: any) => {
          const aTime = new Date(a.metadata?.creationTimestamp || 0).getTime();
          const bTime = new Date(b.metadata?.creationTimestamp || 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 100);

      // Filter to API-related events only
      const apiRelated = items.filter((evt: any) => {
        const src = (evt.source?.component || '').toLowerCase();
        const msg = (evt.message || '').toLowerCase();
        const reason = (evt.reason || '').toLowerCase();

        if (src.includes('apiserver')) return true;
        if (/\b(get|post|put|delete)\b/.test(msg)) return true;
        if (reason.includes('unauthorized') || reason.includes('forbidden') || reason.includes('failed')) return true;
        return false;
      });

      const result = apiRelated.map((evt: any) => ({
        name: evt.metadata?.name,
        namespace: evt.metadata?.namespace,
        reason: evt.reason,
        message: evt.message,
        type: evt.type,
        firstTimestamp: evt.firstTimestamp || evt.metadata?.creationTimestamp,
        lastTimestamp: evt.lastTimestamp || evt.metadata?.creationTimestamp,
        count: evt.count,
        source: evt.source?.component || 'unknown',
      }));

      this.eventCache.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    } catch (error: any) {
      console.error('Failed to list events', error);
      throw new HttpException(
        `Failed to list events: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getRbac(contextName: string, namespace: string) {
    try {
      const kc = this.loadConfig(contextName);
      const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
      
      const rolesRes: any = await rbacApi.listNamespacedRole(namespace);
      const rolesItems = rolesRes.body ? rolesRes.body.items : rolesRes.items;
      
      const roleBindingsRes: any = await rbacApi.listNamespacedRoleBinding(namespace);
      const bindingsItems = roleBindingsRes.body ? roleBindingsRes.body.items : roleBindingsRes.items;
      
      const clusterRolesRes: any = await rbacApi.listClusterRole();
      const clusterRolesItems = clusterRolesRes.body ? clusterRolesRes.body.items : clusterRolesRes.items;
      
      return {
        roles: rolesItems.map((r: any) => ({
          name: r.metadata?.name,
          namespace: r.metadata?.namespace,
          rulesCount: r.rules?.length || 0,
        })),
        roleBindings: bindingsItems.map((b: any) => ({
          name: b.metadata?.name,
          namespace: b.metadata?.namespace,
          roleRef: b.roleRef?.name,
          subjectsCount: b.subjects?.length || 0,
        })),
        clusterRoles: clusterRolesItems.slice(0, 20).map((cr: any) => ({
          name: cr.metadata?.name,
          rulesCount: cr.rules?.length || 0,
        })),
      };
    } catch (error: any) {
      console.error('Failed to list RBAC resources', error);
      throw new HttpException(
        `Failed to list RBAC: ${error?.message || JSON.stringify(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
