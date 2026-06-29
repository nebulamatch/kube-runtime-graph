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
  data?: any;
  label?: string;
  markerEnd?: any;
  type?: string;
}

@Injectable()
export class GraphService {
  // Simple in-memory cache for graph snapshots to avoid frequent K8s API calls
  private graphCache: Map<string, { ts: number; data: { nodes: Node[]; edges: Edge[] } }> = new Map();
  private readonly cacheTtlMs = 2000; // 2 seconds
  private podCache: Map<string, string> = new Map(); // IP -> podId
  private ipToServiceCache: Map<string, string> = new Map(); // IP -> svcId
  private serviceIpCache: Map<string, string> = new Map(); // cluster/external IP -> svcId
  private ipToNamespaceCache: Map<string, string> = new Map(); // IP -> namespace
  private ipToDbCache: Map<string, string> = new Map(); // IP -> dbNodeId
  private discoveredDbs: Map<string, Node> = new Map(); // dbNodeId -> Node
  private activeEdges: Map<string, Edge> = new Map(); // EdgeId -> Edge
  private serviceCallGraph: Map<string, Set<string>> = new Map(); // svcId -> Set of target svcIds
  // Trace grouping map: traceId -> last seen nodeId in the trace chain
  private traceLastNode: Map<string, string> = new Map();
  private lastResolveAt = 0;
  private lastResolveErrorAt = 0;

  private invalidateGraphCache() {
    this.graphCache.clear();
  }

  private getNamespaceFromNodeId(nodeId: string): string | undefined {
    for (const entry of this.graphCache.values()) {
      const found = entry.data.nodes.find((n) => n.id === nodeId);
      if (found?.data?.namespace) return found.data.namespace;
    }
    return undefined;
  }

  // Fallback: resolve IPs by querying the Kubernetes API when caches miss.
  // This helps when telemetry arrives before a client has requested a graph
  // snapshot (so in-memory caches aren't populated yet).
  private async resolveIpMappings(ips: string[]) {
    // Throttle heavy lookups to at most once every 30s to avoid repeated
    // failing network calls which can destabilize the process in constrained
    // environments.
    try {
      const now = Date.now();
      if (now - this.lastResolveAt < 30_000) return;
      this.lastResolveAt = now;

      const kc = new k8s.KubeConfig();
      // If running in-cluster, prefer the cluster DNS name so requests go
      // through the cluster DNS (kube-dns) instead of any external API
      // endpoint present in KUBERNETES_SERVICE_HOST which may be unreachable
      // from pods in some managed environments.
      if (process.env.KUBERNETES_SERVICE_HOST) {
        process.env.KUBERNETES_SERVICE_HOST = 'kubernetes.default.svc';
        process.env.KUBERNETES_SERVICE_PORT = '443';
        kc.loadFromCluster();
      } else {
        kc.loadFromDefault();
      }
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      const withTimeout = async <T>(p: Promise<T>, ms: number) => {
        return await Promise.race<T>([
          p,
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
        ] as any);
      };

      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Retry helper with exponential backoff and increasing timeouts.
      const attemptApiCall = async <T>(fn: () => Promise<T>) => {
        const maxRetries = 2;
        let lastErr: any = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const timeoutMs = 10000 * (attempt + 1); // 10s, then 20s
            return await withTimeout(fn(), timeoutMs);
          } catch (err) {
            lastErr = err;
            await sleep(500 * (attempt + 1));
          }
        }
        throw lastErr;
      };

      // List services across all namespaces and map clusterIP/external IPs
      const servicesRes: any = await attemptApiCall(() => k8sApi.listServiceForAllNamespaces());
      const servicesItems = servicesRes.body ? servicesRes.body.items : servicesRes.items;
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
      });

      // List pods across all namespaces and map pod IPs
      const podsRes: any = await attemptApiCall(() => k8sApi.listPodForAllNamespaces());
      const podsItems = podsRes.body ? podsRes.body.items : podsRes.items;
      podsItems.forEach((pod: any) => {
        if (pod.status?.podIP) {
          const podId = `pod-${pod.metadata.name}`;
          this.podCache.set(pod.status.podIP, podId);
        }
      });
    } catch (e) {
      // non-fatal; if lookup fails we'll continue without resolving.
      // Log at most once per minute to avoid log spam and temporarily
      // disable further resolution attempts for a longer window to avoid
      // repeated timeouts destabilizing the pod.
      const now = Date.now();
      if (now - this.lastResolveErrorAt > 60_000) {
        console.warn('resolveIpMappings failed', e && e.message ? e.message : e);
        this.lastResolveErrorAt = now;
      }
      // Silence further attempts for 2 minutes after a persistent failure
      this.lastResolveAt = Date.now() + 120_000;
    }
  }

  // Classify service type by name patterns
  private classifyServiceType(serviceName: string): 'gateway' | 'microservice' | 'database' | 'other' {
    const lower = serviceName.toLowerCase();
    // Gateway/API patterns
    if (/gateway|api|ingress|loadbalancer|frontend|ui|web/.test(lower)) return 'gateway';
    // Database patterns
    if (/db|database|postgres|mysql|mongo|redis|cache|supabase|dynamodb|elasticsearch|kafka|pg|rds|aurora|cockroach|timescale/i.test(lower)) return 'database';
    // Default to microservice for most service names
    return 'microservice';
  }

  // Calculate hierarchy level for each service: 0 = API/Gateway, 1 = Microservices, 2 = Databases
  private calculateServiceHierarchy(services: string[], servicesMetadata?: Map<string, any>): Map<string, number> {
    const hierarchy = new Map<string, number>();
    
    // First pass: classify by type
    const typeMap = new Map<string, 'gateway' | 'microservice' | 'database' | 'other'>();
    services.forEach(svcId => {
      const svcName = svcId.replace('svc-', '');
      typeMap.set(svcId, this.classifyServiceType(svcName));
    });

    // Second pass: assign hierarchy levels based on type and call graph
    const callers = new Set(this.serviceCallGraph.keys());
    const callees = new Set<string>();
    for (const targets of this.serviceCallGraph.values()) {
      targets.forEach(t => callees.add(t));
    }

    // Assign levels:
    // Level 0: Gateways and entry points (callers but not callees, or explicitly gateway type)
    // Level 1: Microservices (those between gateways and databases)
    // Level 2: Databases (those not calling anything or are database type)
    
    services.forEach(svcId => {
      const type = typeMap.get(svcId);
      
      if (type === 'database') {
        hierarchy.set(svcId, 2);
      } else if (type === 'gateway') {
        hierarchy.set(svcId, 0);
      } else if (type === 'microservice') {
        // If it's a caller but not called, it's likely a gateway
        const isCaller = callers.has(svcId);
        const isCallee = callees.has(svcId);
        
        if (isCaller && !isCallee) {
          hierarchy.set(svcId, 0); // Entry point
        } else if (isCallee && !isCaller) {
          hierarchy.set(svcId, 1); // Called but doesn't call others
        } else if (isCaller && isCallee) {
          hierarchy.set(svcId, 1); // Middle service
        } else {
          hierarchy.set(svcId, 1); // Isolated microservice
        }
      } else {
        hierarchy.set(svcId, 1); // Default to middle
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
      this.ipToNamespaceCache.clear();

      // ── STEP 1: Populate IP ↔ node caches from K8s inventory.
      //    We do NOT push any nodes/edges into the output here.
      //    The graph is built ONLY from activeEdges (real observed traffic).
      const servicesRes: any = await k8sApi.listNamespacedService(namespace);
      const servicesItems = servicesRes.body ? servicesRes.body.items : servicesRes.items;
      const podsRes: any = await k8sApi.listNamespacedPod(namespace);
      const podsItems = podsRes.body ? podsRes.body.items : podsRes.items;

      // Build all namespace service IP mappings
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
          if (svc.metadata?.namespace) this.ipToNamespaceCache.set(svcClusterIp, svc.metadata.namespace);
        }
        [...externalIps, ...lbIngressIps].filter(Boolean).forEach((ip) => {
          this.serviceIpCache.set(ip, svcId);
          this.ipToServiceCache.set(ip, svcId);
          if (svc.metadata?.namespace) this.ipToNamespaceCache.set(ip, svc.metadata.namespace);
        });
      });

      // Build all pod IP mappings
      podsItems.forEach((pod: any) => {
        const svcId = this.getServiceForPod(pod, servicesItems);
        const podId = `pod-${pod.metadata.name}`;
        if (pod.status?.podIP) {
          if (svcId) this.ipToServiceCache.set(pod.status.podIP, svcId);
          this.podCache.set(pod.status.podIP, podId);
          if (pod.metadata?.namespace) this.ipToNamespaceCache.set(pod.status.podIP, pod.metadata.namespace);
        }
      });

      // ── STEP 2: Build graph ONLY from real traffic (activeEdges).
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Build a lookup map of all k8s service metadata by svcId
      const svcMeta = new Map<string, any>();
      servicesItems.forEach((svc: any) => svcMeta.set(`svc-${svc.metadata.name}`, svc));

      // Build a lookup map of all k8s pod metadata by podId
      const podMeta = new Map<string, any>();
      podsItems.forEach((pod: any) => podMeta.set(`pod-${pod.metadata.name}`, pod));

      // Only nodes that appear in activeEdges get added to the output
      const activeNodeIds = new Set<string>();
      this.activeEdges.forEach((edge) => {
        if (!edge.data?.isStructural) {
          activeNodeIds.add(edge.source);
          activeNodeIds.add(edge.target);
        }
      });

      // For each active node, generate a rich node object
      activeNodeIds.forEach((nodeId) => {
        const existing = nodes.find((n) => n.id === nodeId);
        if (existing) return;

        if (nodeId.startsWith('svc-')) {
          const svc = svcMeta.get(nodeId);
          nodes.push({
            id: nodeId,
            type: 'service',
            position: { x: 0, y: 0 }, // layout will recalculate on frontend
            data: {
              label: svc?.metadata?.name || nodeId.replace('svc-', ''),
              type: 'service',
              rps: 0, latency: '0ms', errorRate: 0,
              ip: svc?.spec?.clusterIP || '',
              namespace: svc?.metadata?.namespace || namespace,
            },
          });
        } else if (nodeId.startsWith('pod-')) {
          const pod = podMeta.get(nodeId);
          nodes.push({
            id: nodeId,
            type: 'pod',
            position: { x: 0, y: 0 },
            data: {
              label: pod?.metadata?.name || nodeId.replace('pod-', ''),
              type: 'pod',
              rps: 0, latency: '0ms', errorRate: 0,
              ip: pod?.status?.podIP || '',
              namespace: pod?.metadata?.namespace || namespace,
              status: pod?.status?.phase || 'Unknown',
            },
          });
        } else if (nodeId.startsWith('db-')) {
          const dbNode = this.discoveredDbs.get(nodeId);
          nodes.push(dbNode || {
            id: nodeId,
            type: 'db',
            position: { x: 0, y: 0 },
            data: { label: nodeId.replace(/^db-[^-]+-/, '').toUpperCase() + ' DB', type: 'db', rps: 0, latency: '0ms', errorRate: 0 },
          });
        } else if (nodeId.startsWith('ext-')) {
          const extNode = this.discoveredDbs.get(nodeId);
          nodes.push(extNode || {
            id: nodeId,
            type: 'external',
            position: { x: 0, y: 0 },
            data: { label: nodeId.replace('ext-', ''), type: 'external', rps: 0, latency: '0ms', errorRate: 0, namespace: 'external' },
          });
        }
      });

      // Emit all activeEdges (skip structural—those only show when there's real traffic)
      this.activeEdges.forEach((edge) => {
        if (edge.data?.isStructural) return;
        const sourceExists = nodes.find((n) => n.id === edge.source);
        const targetExists = nodes.find((n) => n.id === edge.target);
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

  // Helper: find the service ID that owns a pod (by label selector match)
  private getServiceForPod(pod: any, servicesItems: any[]): string | undefined {
    for (const svc of servicesItems) {
      const selector = svc.spec?.selector;
      if (!selector || Object.keys(selector).length === 0) continue;
      const matches = Object.keys(selector).every(
        (key) => pod.metadata?.labels?.[key] === selector[key]
      );
      if (matches) return `svc-${svc.metadata.name}`;
    }
    return undefined;
  }

  async processTelemetry(payload: {
    sourceIp: string;
    destIp: string;
    destPort: number;
    method?: string;
    path?: string;
    url?: string;
    headers?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    statusCode?: number;
    responseBody?: string;
    durationMs?: number;
  }) {
    // ── Drop known Kubernetes system ports that are never application traffic ──
    const SYSTEM_PORTS = new Set([
      9153,  // CoreDNS metrics
      10248, // kubelet healthz
      10249, // kube-proxy metrics
      10250, // kubelet HTTPS
      10255, // kubelet read-only
      10257, // kube-controller-manager
      10259, // kube-scheduler
      10092, // kubelet health (Azure CNI)
      10096, // kubelet (Azure)
      19100, // kubelet metrics (Azure CNI)
      20257, // kube-proxy liveness
      29615, // node-problem-detector
      8081, 8082, 8083, 8084, // konnectivity
      6443,  // Kubernetes API server
      3000,  // Kube Runtime Graph Frontend
      3001,  // Kube Runtime Graph Backend
    ]);
    if (SYSTEM_PORTS.has(payload.destPort)) return null;

    // Drop Azure IMDS / Wire-server traffic
    if (payload.destIp === '169.254.169.254' || payload.destIp === '168.63.129.16') return null;

    let sourceNodeId = this.ipToServiceCache.get(payload.sourceIp) || this.podCache.get(payload.sourceIp);
    let destNodeId = this.serviceIpCache.get(payload.destIp) || this.ipToServiceCache.get(payload.destIp) || this.podCache.get(payload.destIp);

    // If we don't have mappings yet, attempt a lightweight resolution against the
    // cluster so telemetry arriving before a client-requested snapshot can still
    // be mapped to nodes.
    if ((!sourceNodeId || !destNodeId) && payload.sourceIp && payload.destIp) {
      await this.resolveIpMappings([payload.sourceIp, payload.destIp]);
      sourceNodeId = this.ipToServiceCache.get(payload.sourceIp) || this.podCache.get(payload.sourceIp) || sourceNodeId;
      destNodeId = this.serviceIpCache.get(payload.destIp) || this.ipToServiceCache.get(payload.destIp) || this.podCache.get(payload.destIp) || destNodeId;
    }

    const newNodes: Node[] = [];

    if (!sourceNodeId) {
      sourceNodeId = `ext-${payload.sourceIp}`;
      if (!this.discoveredDbs.has(sourceNodeId)) {
        // We can parse headers to see if it's APIM
        let label = 'External Client';
        if (payload.headers && (payload.headers['x-apim-gateway'] || payload.headers['ocp-apim-subscription-key'])) {
          label = 'Azure APIM';
        }

        const extNode: Node = {
          id: sourceNodeId,
          type: 'custom',
          position: { x: Math.random() * 800, y: Math.random() * 200 },
          data: {
            label: label,
            type: 'external',
            rps: 0,
            latency: '0ms',
            errorRate: 0,
          }
        };
        this.discoveredDbs.set(sourceNodeId, extNode);
        newNodes.push(extNode);
      }
    }

    // DB and External Heuristics
    if (!destNodeId) {
      const hostHeader = payload.headers?.['host'] || payload.headers?.['origin'] || '';
      const isSupabase = hostHeader.includes('supabase') || (payload.url || '').includes('supabase');

      if (payload.destPort === 5432) destNodeId = `db-postgres-${payload.destIp}`;
      else if (payload.destPort === 3306) destNodeId = `db-mysql-${payload.destIp}`;
      else if (payload.destPort === 27017) destNodeId = `db-mongo-${payload.destIp}`;
      else if (payload.destPort === 6379) destNodeId = `db-redis-${payload.destIp}`;
      else if ((payload.destPort === 443 || payload.destPort === 80) && isSupabase) destNodeId = `db-supabase-${payload.destIp}`;
      else destNodeId = `ext-${payload.destIp}`;
      
      if (destNodeId.startsWith('db-')) {
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
      } else {
        if (!this.discoveredDbs.has(destNodeId)) {
          const extNode: Node = {
            id: destNodeId,
            type: 'custom',
            position: { x: Math.random() * 800, y: Math.random() * 200 },
            data: {
              label: payload.destIp,
              type: 'external',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
            }
          };
          this.discoveredDbs.set(destNodeId, extNode);
          newNodes.push(extNode);
        }
      }
    }

    if (sourceNodeId && destNodeId) {
      // Extract source service name if source is a pod
      const sourceServiceId = this.ipToServiceCache.get(payload.sourceIp);
      const destServiceId = this.ipToServiceCache.get(payload.destIp);
      const sourcePodId = this.podCache.get(payload.sourceIp);
      const destPodId = this.podCache.get(payload.destIp);
      const sourceLabel = sourceServiceId ? sourceServiceId.replace('svc-', '') : (sourcePodId ? sourcePodId.replace('pod-', '') : 'unknown');

      // Track service-to-service relationships for hierarchical layout
      let topologyChanged = false;
      if (sourceServiceId && destServiceId && sourceServiceId !== destServiceId) {
        if (!this.serviceCallGraph.has(sourceServiceId)) {
          this.serviceCallGraph.set(sourceServiceId, new Set());
        }
        const targets = this.serviceCallGraph.get(sourceServiceId)!;
        const before = targets.size;
        targets.add(destServiceId);
        topologyChanged = targets.size > before;
      }

      // Helper: sanitize label parts to safe node ids
      const sanitizeId = (s?: string) => {
        if (!s) return '';
        return String(s).replace(/[^a-zA-Z0-9-_:.]/g, '_').slice(0, 120);
      };

      const syntheticNewNodes: Node[] = [];

      // If upstream forwarded-for header exists and indicates an external origin
      const forwardedFor = (payload.headers && (payload.headers['x-forwarded-for'] || payload.headers['x-forwarded-host'])) as string | undefined;
      let externalLabel = '';
      let isApim = false;

      if (payload.headers && (payload.headers['x-apim-gateway'] || payload.headers['ocp-apim-subscription-key'])) {
        isApim = true;
        externalLabel = 'Azure APIM';
      } else if (forwardedFor && String(forwardedFor).includes('.azure-api.net')) {
        isApim = true;
        externalLabel = 'Azure APIM';
      } else if (forwardedFor) {
        externalLabel = String(forwardedFor).split(',')[0].trim();
      }

      if (externalLabel && externalLabel !== payload.sourceIp) {
        const extId = isApim ? 'ext-azure-apim' : `ext-${sanitizeId(externalLabel)}`;
        if (!this.discoveredDbs.has(extId)) {
          const extNode: Node = {
            id: extId,
            type: 'custom',
            position: { x: Math.random() * 800, y: Math.random() * 200 },
            data: {
              label: externalLabel,
              type: isApim ? 'gateway' : 'external',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
            },
          };
          this.discoveredDbs.set(extId, extNode); // reuse discoveredDbs map for lightweight synthetic nodes
          syntheticNewNodes.push(extNode);
        }

        // Create an active edge from external origin -> sourceNodeId (if sourceNodeId exists)
        if (sourceNodeId) {
          const syntheticEdgeId = `t-${extId}-${sourceNodeId}-fwd`;
          if (!this.activeEdges.has(syntheticEdgeId)) {
            const synthEdge: Edge = {
              id: syntheticEdgeId,
              source: extId,
              target: sourceNodeId,
              animated: isApim,
              style: isApim ? { stroke: '#0078d4', strokeWidth: 2 } : { stroke: '#64748b', strokeDasharray: '4 2' },
            };
            this.activeEdges.set(syntheticEdgeId, synthEdge);
          }
        }
      }

      // Trace-based chaining: if request contains a trace id we can stitch previous node -> this source
      const traceIdHeader = (payload.headers && (payload.headers['traceparent'] || payload.headers['x-request-id'])) as string | undefined;
      if (traceIdHeader) {
        const traceId = String(traceIdHeader).split(',')[0].trim();
        const prev = this.traceLastNode.get(traceId);
        // If we have a previous node and it's different from current source, link prev -> source
        if (prev && prev !== sourceNodeId && sourceNodeId) {
          const chainEdgeId = `trace-${traceId}-${prev}-${sourceNodeId}`;
          if (!this.activeEdges.has(chainEdgeId)) {
            const chainEdge: Edge = {
              id: chainEdgeId,
              source: prev,
              target: sourceNodeId,
              animated: true,
              style: { stroke: '#60a5fa', strokeWidth: 2 },
            };
            this.activeEdges.set(chainEdgeId, chainEdge);
          }
        }
        // After processing this telemetry, set last seen to the destination so next hop can be chained
        if (destNodeId) this.traceLastNode.set(traceId, destNodeId);
      }

      const edge = {
        id: `t-${sourceNodeId}-${destNodeId}-${payload.destPort}`,
        source: sourceNodeId,
        target: destNodeId,
        animated: true,
        label: payload.method && payload.path ? `${payload.method} ${payload.path}` : undefined,
        style: { stroke: '#10b981', strokeWidth: 3 },
        data: { 
          protocol: payload.method && payload.path ? 'http' : 'tcp',
          port: payload.destPort,
          endpoint: payload.method && payload.path ? `${payload.method} ${payload.path}` : undefined,
          method: payload.method,
          path: payload.path,
          url: payload.url,
          headers: payload.headers,
          responseHeaders: payload.responseHeaders,
          statusCode: payload.statusCode,
          responseBody: payload.responseBody,
          durationMs: payload.durationMs,
          sourceIp: payload.sourceIp,
          destIp: payload.destIp,
          sourceService: sourceServiceId?.replace('svc-', ''),
          destService: destServiceId?.replace('svc-', ''),
          sourcePod: sourcePodId?.replace('pod-', ''),
          destPod: destPodId?.replace('pod-', ''),
          originService: sourceLabel,
          originType: sourceServiceId ? 'service' : sourcePodId ? 'pod' : 'unknown',
          // Prefer explicit forwarding headers to detect upstream client/origin (e.g. CDN, ingress)
          requestOrigin: externalLabel || (sourcePodId?.replace('pod-', '') || sourceServiceId?.replace('svc-', '') || sourceLabel),
          timestamp: new Date().toISOString(),
        }
      };
      
      this.activeEdges.set(edge.id, edge);
      this.invalidateGraphCache();

      const sourceNamespace = this.ipToNamespaceCache.get(payload.sourceIp)
        || (sourceServiceId ? this.getNamespaceFromNodeId(sourceServiceId) : undefined);
      const destNamespace = this.ipToNamespaceCache.get(payload.destIp)
        || (destServiceId ? this.getNamespaceFromNodeId(destServiceId) : undefined);

      return {
        edge,
        topologyChanged,
        sourceServiceId,
        destServiceId,
        sourcePodId,
        destPodId,
        sourceNamespace,
        destNamespace,
        newNodes: newNodes.length > 0 ? newNodes : undefined
      };
    }
    return null;
  }

  simulateTraffic() {
    // Traffic simulation is disabled for now as we transition to eBPF real data
    return null;
  }

  // For debugging: return a snapshot of active telemetry edges
  getActiveEdges() {
    return Array.from(this.activeEdges.values());
  }
}
