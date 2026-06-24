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
    ip?: string;
    namespace?: string;
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
  private serviceIpCache: Map<string, string> = new Map(); // cluster/external IP -> svcId
  private ipToDbCache: Map<string, string> = new Map(); // IP -> dbNodeId
  private discoveredDbs: Map<string, Node> = new Map(); // dbNodeId -> Node
  private activeEdges: Map<string, Edge> = new Map(); // EdgeId -> Edge
  private serviceCallGraph: Map<string, Set<string>> = new Map(); // svcId -> Set of target svcIds

  private invalidateGraphCache() {
    this.graphCache.clear();
  }

  // Calculate hierarchy level for each service (0 = root/API services, higher = children)
  private calculateServiceHierarchy(services: string[]): Map<string, number> {
    const hierarchy = new Map<string, number>();
    const visited = new Set<string>();
    
    // Find root services (those that call others but aren't called by anyone)
    const callers = new Set(this.serviceCallGraph.keys());
    const callees = new Set<string>();
    for (const targets of this.serviceCallGraph.values()) {
      targets.forEach(t => callees.add(t));
    }
    
    let rootServices = Array.from(callers).filter(svc => !callees.has(svc));
    if (rootServices.length === 0) {
      // If no clear root, pick the one that calls the most
      let maxCalls = 0;
      rootServices = [Array.from(callers).sort((a, b) => 
        (this.serviceCallGraph.get(b)?.size || 0) - (this.serviceCallGraph.get(a)?.size || 0)
      )[0]].filter(Boolean);
    }
    
    // BFS to assign levels
    const queue: [string, number][] = rootServices.map(s => [s, 0]);
    services.forEach(s => {
      if (!callers.has(s) && !callees.has(s)) {
        queue.push([s, 0]); // Isolated services are roots too
      }
    });

    while (queue.length > 0) {
      const [serviceId, level] = queue.shift()!;
      if (visited.has(serviceId)) continue;
      visited.add(serviceId);
      hierarchy.set(serviceId, level);

      const targets = this.serviceCallGraph.get(serviceId);
      if (targets) {
        targets.forEach(target => {
          if (!visited.has(target)) {
            queue.push([target, level + 1]);
          }
        });
      }
    }

    // Any service not visited is at level 0
    services.forEach(s => {
      if (!hierarchy.has(s)) {
        hierarchy.set(s, 0);
      }
    });

    return hierarchy;
  }

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
      this.serviceIpCache.clear();

      // Fetch Services
      const servicesRes: any = await k8sApi.listNamespacedService(namespace);
      const servicesItems = servicesRes.body ? servicesRes.body.items : servicesRes.items;
      
      // Fetch Pods
      const podsRes: any = await k8sApi.listNamespacedPod(namespace);
      const podsItems = podsRes.body ? podsRes.body.items : podsRes.items;

      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // First pass: build service IDs and hierarchy
      const serviceIds = servicesItems.map((svc: any) => `svc-${svc.metadata.name}`);
      const hierarchy = this.calculateServiceHierarchy(serviceIds);

      // Group services by hierarchy level
      const servicesByLevel = new Map<number, any[]>();
      servicesItems.forEach((svc: any) => {
        const svcId = `svc-${svc.metadata.name}`;
        const level = hierarchy.get(svcId) || 0;
        if (!servicesByLevel.has(level)) {
          servicesByLevel.set(level, []);
        }
        servicesByLevel.get(level)!.push(svc);
      });

      const levelSpacing = 300;
      const startY = 50;
      const startX = 100;

      // Position services hierarchically: level 0 at top center, level 1 below and spread out, etc
      servicesItems.forEach((svc: any) => {
        const svcId = `svc-${svc.metadata.name}`;
        const svcClusterIp = svc.spec?.clusterIP;
        const externalIps: string[] = Array.isArray(svc.spec?.externalIPs) ? svc.spec.externalIPs : [];
        const lbIngressIps: string[] = Array.isArray(svc.status?.loadBalancer?.ingress)
          ? svc.status.loadBalancer.ingress.map((ingress: any) => ingress.ip).filter(Boolean)
          : [];

        if (svcClusterIp && svcClusterIp !== 'None') {
          this.serviceIpCache.set(svcClusterIp, svcId);
          this.ipToServiceCache.set(svcClusterIp, svcId);
        }
        [...externalIps, ...lbIngressIps].filter(Boolean).forEach((ip) => {
          this.serviceIpCache.set(ip, svcId);
          this.ipToServiceCache.set(ip, svcId);
        });

        // Calculate position based on hierarchy
        const level = hierarchy.get(svcId) || 0;
        const levelsServices = servicesByLevel.get(level) || [];
        const indexInLevel = levelsServices.indexOf(svc);
        const servicesInThisLevel = levelsServices.length;
        const horizontalSpacing = 400;
        const xOffset = startX + (indexInLevel - (servicesInThisLevel - 1) / 2) * horizontalSpacing;
        const yOffset = startY + level * levelSpacing;

        nodes.push({
          id: svcId,
          type: 'custom',
          position: { x: xOffset, y: yOffset },
          data: {
            label: svc.metadata.name,
            type: 'service',
            rps: 0,
            latency: '0ms',
            errorRate: 0,
            ip: svcClusterIp || externalIps[0] || lbIngressIps[0] || '',
            namespace: svc.metadata?.namespace,
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
                x: xOffset + (podIndex - (matchingPods.length - 1) / 2) * 60, 
                y: yOffset + 150 
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
      let orphanYOffset = startY + (Math.max(...Array.from(hierarchy.values())) + 2) * levelSpacing;
      podsItems.forEach((pod: any) => {
        const podId = `pod-${pod.metadata.name}`;
        
        if (pod.status?.podIP) {
          this.podCache.set(pod.status.podIP, podId);
        }

        if (!nodes.find(n => n.id === podId)) {
          nodes.push({
            id: podId,
            type: 'custom',
            position: { x: startX, y: orphanYOffset },
            data: {
              label: pod.metadata.name,
              type: 'pod',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
              status: pod.status?.phase,
            },
          });
          orphanYOffset += 150;
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
    let destNodeId = this.serviceIpCache.get(payload.destIp) || this.ipToServiceCache.get(payload.destIp) || this.podCache.get(payload.destIp);

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
      const destServiceId = this.ipToServiceCache.get(payload.destIp);
      const sourcePodId = this.podCache.get(payload.sourceIp);
      const sourceLabel = sourceServiceId ? sourceServiceId.replace('svc-', '') : (sourcePodId ? sourcePodId.replace('pod-', '') : 'unknown');

      // Track service-to-service relationships for hierarchical layout
      if (sourceServiceId && destServiceId && sourceServiceId !== destServiceId) {
        if (!this.serviceCallGraph.has(sourceServiceId)) {
          this.serviceCallGraph.set(sourceServiceId, new Set());
        }
        this.serviceCallGraph.get(sourceServiceId)!.add(destServiceId);
      }

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
      this.invalidateGraphCache();

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
