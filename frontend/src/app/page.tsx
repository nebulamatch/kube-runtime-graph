'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNodesState, useEdgesState, MarkerType } from 'reactflow';
import { io } from 'socket.io-client';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { GraphCanvas } from '../components/organisms/GraphCanvas';
import { ActionPanel } from '../components/organisms/ActionPanel';
import { SplashScreen } from '../components/organisms/SplashScreen';
import { useKubeGlobal } from '../context/KubeContext';
import { socketUrl } from '../lib/backend';

const stripAnsi = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

export default function Home() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [socket, setSocket] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Artificial delay to show the awesome splash screen
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    // Do not connect socket until the user has selected a context and namespace
    if (!selectedContext || !selectedNamespace) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected to backend');
      newSocket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
    });

    // Merge incoming full-graph updates instead of replacing the entire state
    newSocket.on('graphUpdate', (data) => {
      if (!data.nodes || data.nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const mappedNodes = data.nodes.map((n: any) => ({
        ...n,
        type: n.data?.type === 'service' || n.data?.type === 'db' ? 'custom' : 'pod',
      }));
      const mappedEdges = data.edges.map((e: any) => {
        const sourceNode = data.nodes.find((n: any) => n.id === e.source);
        const targetNode = data.nodes.find((n: any) => n.id === e.target);
        const isServiceToService = sourceNode?.data?.type === 'service' && targetNode?.data?.type === 'service';
        return {
          ...e,
          type: e.type || 'custom',
          markerEnd: { type: MarkerType.ArrowClosed, color: isServiceToService ? '#f97316' : 'var(--color-primary-container)' },
          style: isServiceToService ? { strokeWidth: 4, stroke: '#f97316', strokeDasharray: '5,5' } : { strokeWidth: 2, stroke: 'var(--color-primary-container)' },
          animated: true,
        };
      });

      // Merge nodes: update positions/data for existing, add new
      setNodes((prev) => {
        const prevMap = new Map(prev.map(n => [n.id, n]));
        mappedNodes.forEach(ln => {
          if (prevMap.has(ln.id)) {
            const existing = prevMap.get(ln.id)!;
            prevMap.set(ln.id, { ...existing, ...ln });
          } else {
            prevMap.set(ln.id, ln);
          }
        });
        // Keep ordering from backend to reflect hierarchy intent
        return mappedNodes.map(n => prevMap.get(n.id)!).filter(Boolean);
      });

      // Replace edge set from backend snapshot
      setEdges(() => mappedEdges);
    });

    // Handle telemetry deltas emitted from backend. The payload is expected to
    // contain an `edge` and optionally `newNodes`. Merge them locally and
    // debounce layout recalculation to avoid repeated heavy requests.
    const layoutDebounceRef = { current: null as any };

    const processTelemetry = (payload: any) => {
      if (!payload) return;

      const incomingEdge = payload.edge || payload;
      const incomingNewNodes = payload.newNodes;

      if (incomingNewNodes && Array.isArray(incomingNewNodes) && incomingNewNodes.length > 0) {
        setNodes((prev) => {
          const ids = new Set(prev.map((n) => n.id));
          const toAdd = incomingNewNodes.filter((n: any) => !ids.has(n.id)).map((n: any) => ({ ...n, type: n.data?.type || 'pod' }));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }

      if (incomingEdge && incomingEdge.id) {
        setEdges((prev) => {
          const exists = prev.some((e) => e.id === incomingEdge.id);
          
          // Check if this is a service-to-service edge by looking at source/target IDs
          const isServiceToService = incomingEdge.source?.startsWith('svc-') && incomingEdge.target?.startsWith('svc-');
          
          const normalized = {
            id: incomingEdge.id,
            source: incomingEdge.source,
            target: incomingEdge.target,
            animated: incomingEdge.animated ?? true,
            label: incomingEdge.label ?? undefined,
            data: incomingEdge.data ?? incomingEdge,
            style: isServiceToService 
              ? { strokeWidth: 4, stroke: '#f97316', strokeDasharray: '5,5' }
              : incomingEdge.style ?? { strokeWidth: 3, stroke: '#10b981' },
            type: incomingEdge.type ?? 'custom',
            markerEnd: { type: MarkerType.ArrowClosed, color: isServiceToService ? '#f97316' : '#10b981' },
          } as any;

          if (exists) {
            return prev.map((e) => (e.id === normalized.id ? { ...e, ...normalized } : e));
          }
          return [...prev, normalized];
        });
      }

      // Do NOT force a full graph refresh on every telemetry event. The
      // backend will broadcast a 'graphUpdate' when topology/layout changes
      // in a meaningful way. This prevents blinking and full re-layout on
      // high-frequency updates.
    };

    newSocket.on('telemetryUpdate', (payload: any) => {
      if (!payload) return;

      // Support batched payloads: { batch: true, items: [...] }
      if (payload.batch && Array.isArray(payload.items)) {
        payload.items.forEach((it: any) => processTelemetry(it));
      } else if (Array.isArray(payload)) {
        payload.forEach((it: any) => processTelemetry(it));
      } else {
        processTelemetry(payload);
      }

      // No client-side auto-layout here; backend controls hierarchy positions.
    });

    newSocket.on('logUpdate', (data) => {
      const cleanLine = stripAnsi(data);
      setLogs((prev) => [...prev, cleanLine].slice(-100)); // Keep last 100 lines
    });

    return () => {
      newSocket.close();
    };
  }, [isLoading, selectedContext, selectedNamespace, setNodes, setEdges]);

  // Request update when context/namespace changes explicitly
  useEffect(() => {
    if (socket && selectedContext && selectedNamespace) {
      socket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
    }
  }, [socket, selectedContext, selectedNamespace]);

  const onNodeClick = useCallback((event: any, node: any) => {
    setSelectedNode(node);
    setLogs([]);
    setIsPanelOpen(true);
    
    // Only subscribe to logs if it's a pod
    if (socket && node.data?.type === 'pod' && selectedContext && selectedNamespace) {
      socket.emit('subscribeLogs', {
        context: selectedContext,
        namespace: selectedNamespace,
        podName: node.data.label,
      });
    }
  }, [socket, selectedContext, selectedNamespace]);

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    if (socket && selectedNode?.data?.label) {
      socket.emit('unsubscribeLogs');
    }
    setSelectedNode(null);
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <DashboardLayout>
      <div className="w-full h-full relative">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
        />
        
        <ActionPanel
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          podName={selectedNode?.data?.label || ''}
          logs={logs}
          nodeData={selectedNode}
          edges={edges}
        />
      </div>
    </DashboardLayout>
  );
}
