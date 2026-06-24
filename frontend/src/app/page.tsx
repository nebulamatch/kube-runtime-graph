'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNodesState, useEdgesState, MarkerType } from 'reactflow';
import { io } from 'socket.io-client';
import dagre from 'dagre';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { GraphCanvas } from '../components/organisms/GraphCanvas';
import { ActionPanel } from '../components/organisms/ActionPanel';
import { SplashScreen } from '../components/organisms/SplashScreen';
import { useKubeGlobal } from '../context/KubeContext';
import { socketUrl } from '../lib/backend';

// Create dagre graph per-layout to avoid retaining state between runs

const stripAnsi = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';

  // Work on shallow copies to avoid mutating upstream data
  const nextNodes = nodes.map((n) => ({ ...n }));
  const nextEdges = edges.map((e) => ({ ...e }));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction });

  nextNodes.forEach((node) => {
    g.setNode(node.id, { width: 280, height: 120 });
  });

  nextEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  nextNodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id);
    if (!nodeWithPosition) return;

    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';

    node.position = {
      x: nodeWithPosition.x - 280 / 2,
      y: nodeWithPosition.y - 120 / 2,
    };
  });

  return { nodes: nextNodes, edges: nextEdges };
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

    const newSocket = io(socketUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected to backend');
      if (selectedContext && selectedNamespace) {
        newSocket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
      }
    });

    newSocket.on('graphUpdate', (data) => {
      if (!data.nodes || data.nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        data.nodes.map((n: any) => ({
          ...n,
          type: n.data?.type === 'service' ? 'custom' : 'pod',
        })),
        data.edges.map((e: any) => ({
          ...e,
          type: e.type || 'custom',
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-primary-container)' },
          style: { strokeWidth: 2, stroke: 'var(--color-primary-container)' },
          animated: true,
        })),
        'LR'
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
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
          const normalized = {
            id: incomingEdge.id,
            source: incomingEdge.source,
            target: incomingEdge.target,
            animated: incomingEdge.animated ?? true,
            label: incomingEdge.label ?? undefined,
            data: incomingEdge.data ?? incomingEdge,
            style: incomingEdge.style ?? incomingEdge.style,
            type: incomingEdge.type ?? 'custom',
            markerEnd: incomingEdge.markerEnd ?? { type: 1 },
          } as any;

          if (exists) {
            return prev.map((e) => (e.id === normalized.id ? { ...e, ...normalized } : e));
          }
          return [...prev, normalized];
        });
      }

      // When traffic changes, request a fresh graph snapshot so the layout can
      // move service/pod/db nodes based on current relationships.
      if (selectedContext && selectedNamespace) {
        newSocket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
      }
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

      // Debounced layout update - recalculate layout when traffic arrives
      if (layoutDebounceRef.current) clearTimeout(layoutDebounceRef.current);
      layoutDebounceRef.current = setTimeout(() => {
        setNodes((curNodes) => {
          const layoutedNodes = curNodes.map(n => ({ ...n }));
          setEdges((curEdges) => {
            const { nodes: newLayoutedNodes, edges: layoutedEdges } = getLayoutedElements(
              layoutedNodes.map(n => ({ ...n, type: n.type || 'pod' })), 
              curEdges.map(e => ({ ...e })), 
              'LR'
            );
            setTimeout(() => {
              setEdges(layoutedEdges);
            }, 0);
            return layoutedEdges;
          });
          return layoutedNodes;
        });
      }, 300);
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
