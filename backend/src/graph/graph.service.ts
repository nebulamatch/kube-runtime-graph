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
  private podCache: Map<string, string> = new Map(); // IP -> podId

  async getGraphData(contextName: string, namespace: string) {
    if (!contextName || !namespace) {
      return { nodes: [], edges: [] };
    }

    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      kc.setCurrentContext(contextName);
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      // Fetch Services
      const servicesRes: any = await k8sApi.listNamespacedService(namespace);
      const servicesItems = servicesRes.body ? servicesRes.body.items : servicesRes.items;
      
      // Fetch Pods
      const podsRes: any = await k8sApi.listNamespacedPod(namespace);
      const podsItems = podsRes.body ? podsRes.body.items : podsRes.items;

      const nodes: Node[] = [];
      const edges: Edge[] = [];

      let xOffset = 100;
      let yOffset = 50;

      // Map Services
      servicesItems.forEach((svc: any) => {
        const svcId = `svc-${svc.metadata.name}`;
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
          },
        });
        
        xOffset += 300;
        if (xOffset > 800) {
          xOffset = 100;
          yOffset += 200;
        }

        // Map Pods for this Service (basic label matching)
        // A simple heuristic: check if pod name starts with service name
        // Or if pod labels match service selector (more accurate)
        const selector = svc.spec?.selector;
        
        podsItems.forEach((pod: any) => {
          let matches = false;
          if (selector) {
            matches = Object.keys(selector).every(
              key => pod.metadata.labels && pod.metadata.labels[key] === selector[key]
            );
          } else {
            // Fallback heuristic
            matches = pod.metadata.name.startsWith(svc.metadata.name);
          }

          if (matches) {
            const podId = `pod-${pod.metadata.name}`;
            // Avoid duplicate pods if they match multiple services
            if (!nodes.find(n => n.id === podId)) {
              nodes.push({
                id: podId,
                type: 'custom',
                position: { x: xOffset - 300 + (Math.random() * 100 - 50), y: yOffset + 150 },
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
            
            // Connect Pod to Service
            edges.push({
              id: `e-${podId}-${svcId}`,
              source: podId,
              target: svcId,
              animated: true,
              style: { stroke: '#9ca3af' },
            });
          }
        });
      });

      // Add any orphaned pods (not matching any service)
      podsItems.forEach((pod: any) => {
        const podId = `pod-${pod.metadata.name}`;
        
        // Cache pod IP for telemetry mapping
        if (pod.status?.podIP) {
          this.podCache.set(pod.status.podIP, podId);
        }

        if (!nodes.find(n => n.id === podId)) {
          nodes.push({
            id: podId,
            type: 'custom',
            position: { x: xOffset, y: yOffset },
            data: {
              label: pod.metadata.name,
              type: 'pod',
              rps: 0,
              latency: '0ms',
              errorRate: 0,
              status: pod.status?.phase,
            },
          });
          xOffset += 200;
          if (xOffset > 800) {
            xOffset = 100;
            yOffset += 200;
          }
        }
      });

      return { nodes, edges };
    } catch (error) {
      console.error('Error fetching graph data from K8s', error);
      return { nodes: [], edges: [] };
    }
  }

  async processTelemetry(payload: { sourceIp: string; destIp: string; destPort: number }) {
    const sourceNodeId = this.podCache.get(payload.sourceIp);
    const destNodeId = this.podCache.get(payload.destIp);

    if (sourceNodeId && destNodeId) {
      return {
        id: `t-${sourceNodeId}-${destNodeId}-${payload.destPort}-${Date.now()}`,
        source: sourceNodeId,
        target: destNodeId,
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 3 },
        data: { port: payload.destPort }
      };
    }
    return null;
  }

  simulateTraffic() {
    // Traffic simulation is disabled for now as we transition to eBPF real data
    return null;
  }
}
