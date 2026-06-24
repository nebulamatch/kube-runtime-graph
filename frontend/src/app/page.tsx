'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useNodesState, useEdgesState, MarkerType } from 'reactflow';
import { io } from 'socket.io-client';
import dagre from 'dagre';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { GraphCanvas } from '../components/organisms/GraphCanvas';
import { ActionPanel } from '../components/organisms/ActionPanel';
import { SplashScreen } from '../components/organisms/SplashScreen';
import { useKubeGlobal } from '../context/KubeContext';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const stripAnsi = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 280, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';
    
    node.position = {
      x: nodeWithPosition.x - 280 / 2,
      y: nodeWithPosition.y - 120 / 2,
    };
    return node;
  });

  return { nodes, edges };
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

    const newSocket = io('http://localhost:3001');
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
          type: 'pod',
        })),
        data.edges.map((e: any) => ({
          ...e,
          type: 'custom',
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-primary-container)' },
          style: { strokeWidth: 2, stroke: 'var(--color-primary-container)' },
          animated: true,
        })),
        'LR'
      );
      
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    });

    newSocket.on('telemetryUpdate', () => {
      // Trigger a graph layout refresh on new telemetry
      if (selectedContext && selectedNamespace) {
        newSocket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
      }
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
        />
      </div>
    </DashboardLayout>
  );
}
