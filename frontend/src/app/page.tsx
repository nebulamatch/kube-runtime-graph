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
} from 'reactflow';
import 'reactflow/dist/style.css';
import styles from './page.module.css';
import CustomNode from '../components/CustomNode';
import { X, Activity, Clock, AlertTriangle } from 'lucide-react';
import { io } from 'socket.io-client';
import ClusterSelector from '../components/ClusterSelector';

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
      setNodes((currentNodes) => {
        return data.nodes;
      });
      setEdges(data.edges);
    });

    socket.on('telemetryUpdate', (newEdge: Edge) => {
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

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

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
          </div>
        )}
      </div>
      )}
    </div>
  );
}
