'use client';

import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './page.module.css';
import CustomNode from '../components/CustomNode';
import { X, Activity, Clock, AlertTriangle } from 'lucide-react';
import { io } from 'socket.io-client';
import ClusterSelector from '../components/ClusterSelector';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 250;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
    
    // Shift position to center
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  return { nodes, edges };
};

const nodeTypes = {
  custom: CustomNode,
};

interface SelectionState {
  selectedContext?: string;
  selectedNamespace?: string;
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState>({});
  const [socket, setSocket] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only connect if a namespace and context are selected
    if (!selection.selectedNamespace || !selection.selectedContext) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const socket = io('http://localhost:3001');

    socket.on('connect', () => {
      console.log('Connected to Backend WebSocket');
      socket.emit('requestUpdate', {
        context: selection.selectedContext,
        namespace: selection.selectedNamespace
      });
    });

    socket.on('graphUpdate', (data: { nodes: Node[], edges: Edge[] }) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(data.nodes, data.edges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    });

    socket.on('telemetryUpdate', (payload: any) => {
      // payload might be an edge, or an object { edge: Edge, newNodes?: Node[] }
      const newEdge = payload.edge || payload;
      
      if (payload.newNodes && Array.isArray(payload.newNodes) && payload.newNodes.length > 0) {
        setNodes((currentNodes) => {
          const toAdd = payload.newNodes.filter((nn: Node) => !currentNodes.some(n => n.id === nn.id));
          const { nodes: layoutedNodes } = getLayoutedElements([...currentNodes, ...toAdd], edges);
          return layoutedNodes;
        });
      }

      setEdges((currentEdges) => {
        // Find if this edge exists
        const existingEdgeIndex = currentEdges.findIndex(e => e.id === newEdge.id || (e.source === newEdge.source && e.target === newEdge.target));
        
        let updatedEdges = [...currentEdges];
        if (existingEdgeIndex >= 0) {
          updatedEdges[existingEdgeIndex] = { ...updatedEdges[existingEdgeIndex], animated: true };
        } else {
          updatedEdges.push(newEdge);
        }

        // After 2 seconds, remove animation to simulate single request burst
        setTimeout(() => {
          setEdges(edges => edges.map(e => {
            if (e.id === newEdge.id || (e.source === newEdge.source && e.target === newEdge.target)) {
              return { ...e, animated: false };
            }
            return e;
          }));
        }, 2000);

        return updatedEdges;
      });
    });

    socket.on('logUpdate', (logLine: string) => {
      setLogs(prev => {
        const newLogs = [...prev, logLine];
        return newLogs.length > 500 ? newLogs.slice(newLogs.length - 500) : newLogs;
      });
    });

    setSocket(socket);

    return () => {
      socket.disconnect();
    };
  }, [selection.selectedNamespace, selection.selectedContext, setNodes, setEdges]);

  const rawNodes = nodes;
  const rawEdges = edges;

  const selectedNode = rawNodes.find(n => n.id === selectedNodeId) || null;

  // Filter nodes and edges based on selection
  let displayNodes = rawNodes;
  let displayEdges = rawEdges;

  if (selectedNodeId) {
    // Find all edges connected to the selected node
    const connectedEdges = rawEdges.filter(
      e => e.source === selectedNodeId || e.target === selectedNodeId
    );
    
    // Find all node IDs that are part of these connected edges
    const connectedNodeIds = new Set([selectedNodeId]);
    connectedEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    displayNodes = rawNodes.filter(n => connectedNodeIds.has(n.id));
    displayEdges = connectedEdges;
  }

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setLogs([]); // clear old logs
    if (socket && node.data?.type === 'pod' && selection.selectedContext && selection.selectedNamespace) {
      socket.emit('subscribeLogs', {
        context: selection.selectedContext,
        namespace: selection.selectedNamespace,
        podName: node.data.label
      });
    }
  }, [socket, selection]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    if (socket) {
      socket.emit('unsubscribeLogs');
    }
  }, [socket]);

  return (
    <div className={styles.pageWrapper} style={{ flexDirection: 'column' }}>
      <ClusterSelector onSelectionChange={setSelection} />
      
      {!selection.selectedNamespace ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Please select a Kubeconfig Context and Namespace to view the runtime graph.
        </div>
      ) : null}

      {selection.selectedNamespace && (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className={styles.graphContainer}>
          <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="dark"
        >
          <Controls />
          <MiniMap nodeColor={(node) => {
            switch (node.data?.type) {
              case 'db': return '#3b82f6';
              case 'external': return '#10b981';
              default: return '#8b5cf6';
            }
          }} />
          <Background color="#374151" gap={16} />
        </ReactFlow>
      </div>

      {selectedNode && (
        <div className={styles.sidePanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>{selectedNode.data?.label}</span>
            <button className={styles.closeButton} onClick={() => setSelectedNodeId(null)}>
              <X size={20} />
            </button>
          </div>
          
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}><Activity size={14} style={{display:'inline', marginRight:'4px'}}/> Requests / sec</div>
              <div className={styles.metricValue}>{selectedNode.data?.rps}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}><Clock size={14} style={{display:'inline', marginRight:'4px'}}/> Avg Latency</div>
              <div className={styles.metricValue}>{selectedNode.data?.latency}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}><AlertTriangle size={14} style={{display:'inline', marginRight:'4px'}}/> Error Rate</div>
              <div className={`${styles.metricValue} ${selectedNode.data?.errorRate > 5 ? styles.error : ''}`}>
                {selectedNode.data?.errorRate}%
              </div>
            </div>
          </div>
          
          <div>
            <h3 style={{fontSize: '0.9rem', marginBottom: '8px'}}>Details</h3>
            <div style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              <p>Type: {selectedNode.data?.type}</p>
              <p>ID: {selectedNode.id}</p>
            </div>
            </div>

            {selectedNode.data?.type === 'pod' && (
              <div style={{ marginTop: '20px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 style={{fontSize: '0.9rem', marginBottom: '8px'}}>Live Logs</h3>
                <div style={{ 
                  flex: 1, 
                  backgroundColor: '#1f2937', 
                  color: '#10b981', 
                  fontFamily: 'monospace', 
                  fontSize: '12px',
                  padding: '10px',
                  borderRadius: '6px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {logs.length === 0 ? 'Waiting for logs...' : logs.map((log, i) => <div key={i}>{log}</div>)}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
