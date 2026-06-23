import { Injectable } from '@nestjs/common';

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
  private nodes: Node[] = [
    {
      id: '1',
      type: 'custom',
      position: { x: 250, y: 50 },
      data: {
        label: 'frontend-service',
        type: 'service',
        rps: 120,
        latency: '15ms',
        errorRate: 0,
      },
    },
    {
      id: '2',
      type: 'custom',
      position: { x: 100, y: 200 },
      data: {
        label: 'auth-service',
        type: 'service',
        rps: 45,
        latency: '200ms',
        errorRate: 2,
      },
    },
    {
      id: '3',
      type: 'custom',
      position: { x: 400, y: 200 },
      data: {
        label: 'payment-service',
        type: 'service',
        rps: 12,
        latency: '800ms',
        errorRate: 10,
      },
    },
    {
      id: '4',
      type: 'custom',
      position: { x: 400, y: 350 },
      data: {
        label: 'postgres-db',
        type: 'db',
        rps: 50,
        latency: '5ms',
        errorRate: 0,
      },
    },
  ];

  private edges: Edge[] = [
    {
      id: 'e1-2',
      source: '1',
      target: '2',
      animated: true,
      style: { stroke: '#9ca3af' },
    },
    {
      id: 'e1-3',
      source: '1',
      target: '3',
      animated: true,
      style: { stroke: '#ef4444', strokeWidth: 2 },
    },
    {
      id: 'e3-4',
      source: '3',
      target: '4',
      animated: true,
      style: { stroke: '#9ca3af' },
    },
  ];

  getGraphData() {
    return { nodes: this.nodes, edges: this.edges };
  }

  // Simulates real-time telemetry updates
  simulateTraffic() {
    this.nodes = this.nodes.map((node) => {
      const isFailing = node.id === '3';
      return {
        ...node,
        data: {
          ...node.data,
          rps: Math.floor(Math.random() * 50) + (isFailing ? 10 : 100),
          latency: `${Math.floor(Math.random() * (isFailing ? 500 : 50)) + (isFailing ? 500 : 10)}ms`,
          errorRate: isFailing ? Math.floor(Math.random() * 20) + 5 : 0,
        },
      };
    });
    return { nodes: this.nodes, edges: this.edges };
  }
}
