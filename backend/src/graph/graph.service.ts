import { Injectable } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';

export interface Node {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: string;
    rps: number;
    latency: string;
    errorRate: number;
    status?: string;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  animated: boolean;
  style?: any;
}

@Injectable()
export class GraphService {
  // Simple in-memory cache for graph snapshots to avoid frequent K8s API calls
  private graphCache: Map<string, { ts: number; data: { nodes: Node[]; edges: Edge[] } }> = new Map();
  private readonly cacheTtlMs = 2000; // 2 seconds
  private podCache: Map<string, string> = new Map(); // IP -> podId
  private ipToServiceCache: Map<string, string> = new Map(); // IP -> svcId
  private ipToDbCache: Map<string, string> = new Map(); // IP -> dbNodeId
  private discoveredDbs: Map<string, Node> = new Map(); // dbNodeId -> Node
  private activeEdges: Map<string, Edge> = new Map(); // EdgeId -> Edge

  async getGraphData(contextName: string, namespace: string) {
    if (!contextName || !namespace) {
      return { nodes: [], edges: [] };
    }

    const cacheKey = `${contextName}::${namespace}`;
    const cached = this.graphCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      return { nodes: cached.data.nodes.slice(), edges: cached.data.edges.slice() };
    }

    try {
      const kc = new k8s.KubeConfig();
      if (process.env.KUBERNETES_SERVICE_HOST) {
        process.env.KUBERNETES_SERVICE_HOST = 'kubernetes.default.svc.cluster.local';
        process.env.KUBERNETES_SERVICE_PORT = '443';
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
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      // Clear caches to prevent stale/dead pods from lingering
      this.podCache.clear();
      this.ipToServiceCache.clear();

      // Fetch Services
      const servicesRes: any = await k8sApi.listNamespacedService(namespace);
      const servicesItems = servicesRes.body ? servicesRes.body.items : servicesRes.items;
      
      // Fetch Pods
      const podsRes: any = await k8sApi.listNamespacedPod(namespace);
      const podsItems = podsRes.body ? podsRes.body.items : podsRes.items;

      const nodes: Node[] = [];
      const edges: Edge[] = [];

      let yOffset = 50;
      const serviceNodeWidth = 320;
      const horizontalSpacing = 350;

      // Map Services as PRIMARY nodes (main focus)
      servicesItems.forEach((svc: any, index: number) => {
        const svcId = `svc-${svc.metadata.name}`;
        nodes.push({
          id: svcId,
          type: 'custom',
          position: { x: index * horizontalSpacing + 100, y: yOffset },
          data: {
            label: svc.metadata.name,
            type: 'service',
            rps: 0,
            latency: '0ms',
            errorRate: 0,
          },
        });

        // Get selector for this service
        const selector = svc.spec?.selector;
        
        // Find pods matching this service and position them below the service
        const matchingPods: any[] = [];
        podsItems.forEach((pod: any) => {
          let matches = false;
          if (selector) {
            matches = Object.keys(selector).every(
              key => pod.metadata.labels && pod.metadata.labels[key] === selector[key]
            );
          } else {
            matches = pod.metadata.name.startsWith(svc.metadata.name);
          }

          if (matches) {
            matchingPods.push(pod);
          }
        });

        // Position pods vertically below service
        matchingPods.forEach((pod, podIndex) => {
          const podId = `pod-${pod.metadata.name}`;
          // Avoid duplicate pods
          if (!nodes.find(n => n.id === podId)) {
            nodes.push({
              id: podId,
              type: 'custom',
              position: { 
                x: index * horizontalSpacing + 100 + (podIndex * 50), 
                y: yOffset + 180 
              },
              data: {
                label: pod.metadata.name,
                type: 'pod',
                rps: 0,
                latency: '0ms',
                errorRate: 0,
                status: pod.status?.phase,
              },
            });
          }

          if (pod.status?.podIP) {
            this.ipToServiceCache.set(pod.status.podIP, svcId);
            this.podCache.set(pod.status.podIP, podId);
          }

          // Connect Pod to Service with service reference
          edges.push({
            id: `e-${podId}-${svcId}`,
            source: podId,
            target: svcId,
            animated: true,
            style: { stroke: '#9ca3af' },
          });
        });
      });

      // Add any orphaned pods (not matching any service)
      podsItems.forEach((pod: any) => {
        const podId = `pod-${pod.metadata.name}`;
        
        if (pod.status?.podIP) {
          this.podCache.set(pod.status.podIP, podId);
        }

        if (!nodes.find(n => n.id === podId)) {
          nodes.push({
            id: podId,
            type: 'custom',
            position: { x: 100, y: yOffset + 400 },
            data: {
              label: pod.metadata.name,
              type: 'pod',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
              status: pod.status?.phase,
            },
          });
          yOffset += 200;
        }
      });

      // Clear old DB cache and mapping for this namespace (in real app, we'd scope by ns)
      
      // Inject dynamically discovered DBs
      Array.from(this.discoveredDbs.values()).forEach(dbNode => {
        nodes.push(dbNode);
      });

      // Inject active telemetry edges
      Array.from(this.activeEdges.values()).forEach(edge => {
        const sourceExists = nodes.some(n => n.id === edge.source);
        const targetExists = nodes.some(n => n.id === edge.target);
        if (sourceExists && targetExists) {
          edges.push(edge);
        }
      });

      // store into cache (best-effort)
      try {
        this.graphCache.set(cacheKey, { ts: Date.now(), data: { nodes, edges } });
      } catch (e) {
        // ignore cache errors
      }

      return { nodes, edges };
    } catch (error) {
      console.error('Error fetching graph data from K8s', error);
      return { nodes: [], edges: [] };
    }
  }

  async processTelemetry(payload: { sourceIp: string; destIp: string; destPort: number; method?: string; path?: string }) {
    let sourceNodeId = this.ipToServiceCache.get(payload.sourceIp) || this.podCache.get(payload.sourceIp);
    let destNodeId = this.ipToServiceCache.get(payload.destIp) || this.podCache.get(payload.destIp);

    const newNodes: Node[] = [];

    // DB Heuristic
    if (!destNodeId) {
      if (payload.destPort === 5432) destNodeId = `db-postgres-${payload.destIp}`;
      else if (payload.destPort === 3306) destNodeId = `db-mysql-${payload.destIp}`;
      else if (payload.destPort === 27017) destNodeId = `db-mongo-${payload.destIp}`;
      else if (payload.destPort === 6379) destNodeId = `db-redis-${payload.destIp}`;
      
      if (destNodeId) {
        this.ipToDbCache.set(payload.destIp, destNodeId);
        if (!this.discoveredDbs.has(destNodeId)) {
          const dbNode: Node = {
            id: destNodeId,
            type: 'custom',
            position: { x: Math.random() * 800, y: Math.random() * 400 },
            data: {
              label: destNodeId.split('-')[1].toUpperCase() + ' DB',
              type: 'db',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
            }
          };
          this.discoveredDbs.set(destNodeId, dbNode);
          newNodes.push(dbNode);
        }
      }
    }

    if (sourceNodeId && destNodeId) {
      // Extract source service name if source is a pod
      const sourceServiceId = this.ipToServiceCache.get(payload.sourceIp);
      const sourcePodId = this.podCache.get(payload.sourceIp);
      const sourceLabel = sourceServiceId ? sourceServiceId.replace('svc-', '') : (sourcePodId ? sourcePodId.replace('pod-', '') : 'unknown');

      const edge = {
        id: `t-${sourceNodeId}-${destNodeId}-${payload.destPort}`,
        source: sourceNodeId,
        target: destNodeId,
        animated: true,
        label: payload.method && payload.path ? `${payload.method} ${payload.path}` : undefined,
        style: { stroke: '#10b981', strokeWidth: 3 },
        data: { 
          port: payload.destPort,
          endpoint: payload.method && payload.path ? `${payload.method} ${payload.path}` : undefined,
          sourceIp: payload.sourceIp,
          destIp: payload.destIp,
          originService: sourceLabel,
          timestamp: new Date().toISOString(),
        }
      };
      
      this.activeEdges.set(edge.id, edge);

      return {
        edge,
        newNodes: newNodes.length > 0 ? newNodes : undefined
      };
    }
    return null;
  }

  simulateTraffic() {
    // Traffic simulation is disabled for now as we transition to eBPF real data
    return null;
  }
}
