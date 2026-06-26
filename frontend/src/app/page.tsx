'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNodesState, useEdgesState, MarkerType } from 'reactflow';
import { io } from 'socket.io-client';
import { DashboardLayout } from '../components/templates/DashboardLayout';
import { GraphCanvas } from '../components/organisms/GraphCanvas';
import { SplashScreen } from '../components/organisms/SplashScreen';
import { useKubeGlobal } from '../context/KubeContext';
import { socketUrl } from '../lib/backend';
import { ActionPanel } from '@/components/organisms/ActionPanel';

const stripAnsi = (str: string) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

// Hierarchical top-to-bottom layout algorithm
const layoutTopToBottom = (nodes: any[], edges: any[]): any[] => {
  if (nodes.length === 0) return nodes;

  const isPod = (node: any) => (node.data?.type || node.type) === 'pod';
  const structuralNodes = nodes.filter((node) => !isPod(node));
  const podNodes = nodes.filter((node) => isPod(node));

  const structuralIds = new Set(structuralNodes.map((node) => node.id));
  const structuralEdges = edges.filter((edge) => structuralIds.has(edge.source) && structuralIds.has(edge.target));

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  structuralNodes.forEach((n) => {
    if (!inDegree.has(n.id)) inDegree.set(n.id, 0);
    if (!adj.has(n.id)) adj.set(n.id, []);
  });

  structuralEdges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });

  const queue: string[] = [];
  const level = new Map<string, number>();

  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
      level.set(nodeId, 0);
    }
  });

  while (queue.length > 0) {
    const node = queue.shift()!;
    adj.get(node)?.forEach((child) => {
      const childLevel = (level.get(node) || 0) + 1;
      level.set(child, Math.max(level.get(child) || 0, childLevel));
      inDegree.set(child, (inDegree.get(child) || 0) - 1);
      if (inDegree.get(child) === 0) queue.push(child);
    });
  }

  structuralNodes.forEach((n) => {
    if (!level.has(n.id)) level.set(n.id, 0);
  });

  const servicePositions = new Map<string, { x: number; y: number; level: number }>();
  const levelMap = new Map<number, any[]>();
  structuralNodes.forEach((n) => {
    const lv = level.get(n.id) || 0;
    if (!levelMap.has(lv)) levelMap.set(lv, []);
    levelMap.get(lv)!.push(n);
  });

  const POD_ROW_GAP = 170;
  const SERVICE_ROW_GAP = 460;
  const BAND_GAP = 240;
  const SERVICE_COL_GAP = 460;

  const podsByService = new Map<string, any[]>();
  podNodes.forEach((pod) => {
    const parentEdge = edges.find((edge) => edge.source === pod.id && structuralIds.has(edge.target));
    const parentId = parentEdge?.target;
    if (!parentId) return;
    if (!podsByService.has(parentId)) podsByService.set(parentId, []);
    podsByService.get(parentId)!.push(pod);
  });

  const levelOrder = [...levelMap.keys()].sort((a, b) => a - b);
  const levelYMap = new Map<number, number>();
  let currentY = 120;
  levelOrder.forEach((lv) => {
    levelYMap.set(lv, currentY);
    const servicesInLevel = levelMap.get(lv) || [];
    const maxPodsInLevel = Math.max(
      1,
      ...servicesInLevel.map((svc) => (podsByService.get(svc.id) || []).length || 0),
    );
    const bandHeight = SERVICE_ROW_GAP + Math.max(0, maxPodsInLevel - 1) * POD_ROW_GAP;
    currentY += bandHeight + BAND_GAP;
  });

  const positionedStructural = structuralNodes.map((n) => {
    const lv = level.get(n.id) || 0;
    const nodesAtLevel = levelMap.get(lv) || [];
    const indexAtLevel = nodesAtLevel.findIndex((item) => item.id === n.id);
    const countAtLevel = nodesAtLevel.length;
    const y = levelYMap.get(lv) || 120;
    const x = (indexAtLevel - (countAtLevel - 1) / 2) * SERVICE_COL_GAP;
    servicePositions.set(n.id, { x, y, level: lv });
    return { ...n, position: { x, y } };
  });

  const positionedPods = podNodes.map((pod) => {
    const parentEdge = edges.find((edge) => edge.source === pod.id && structuralIds.has(edge.target));
    const parentId = parentEdge?.target;
    const parentPos = parentId ? servicePositions.get(parentId) : undefined;
    if (!parentPos) {
      return {
        ...pod,
        position: { x: 0, y: currentY },
      };
    }

    const siblings = podsByService.get(parentId) || [];
    const index = siblings.findIndex((item) => item.id === pod.id);
    const x = parentPos.x;
    const y = parentPos.y + 180 + Math.max(0, index) * POD_ROW_GAP;

    return {
      ...pod,
      position: { x, y },
      data: {
        ...pod.data,
        parentService: parentId?.replace('svc-', ''),
        podClusterIndex: index,
        podClusterRow: index,
        podClusterSize: siblings.length,
      },
    };
  });

  return [...positionedStructural, ...positionedPods];
};

const cloneGraph = (nodes: any[], edges: any[]) => ({
  nodes: nodes.map((node) => ({
    ...node,
    position: { ...(node.position || { x: 0, y: 0 }) },
    data: node.data ? { ...node.data } : node.data,
    style: node.style ? { ...node.style } : node.style,
  })),
  edges: edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : edge.data,
    style: edge.style ? { ...edge.style } : edge.style,
  })),
});

const findNearestSnapshot = (history: { ts: string; nodes: any[]; edges: any[] }[], lookbackMinutes: number) => {
  if (history.length === 0 || lookbackMinutes <= 0) return null;

  const targetTime = Date.now() - lookbackMinutes * 60 * 1000;
  const sorted = [...history].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  let candidate = sorted[0];
  for (const snapshot of sorted) {
    const snapshotTime = new Date(snapshot.ts).getTime();
    if (snapshotTime <= targetTime) {
      candidate = snapshot;
    } else {
      break;
    }
  }

  return candidate;
};

const traverseGraph = (startId: string, edges: any[]) => {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const upstreamEdges = new Set<string>();
  const downstreamEdges = new Set<string>();

  const bySource = new Map<string, any[]>();
  const byTarget = new Map<string, any[]>();

  edges.forEach((edge) => {
    if (!bySource.has(edge.source)) bySource.set(edge.source, []);
    if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
    bySource.get(edge.source)!.push(edge);
    byTarget.get(edge.target)!.push(edge);
  });

  const walk = (seed: string, direction: 'up' | 'down') => {
    const visited = new Set<string>([seed]);
    const queue = [seed];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const candidates = direction === 'down' ? (bySource.get(nodeId) || []) : (byTarget.get(nodeId) || []);

      candidates.forEach((edge) => {
        const nextId = direction === 'down' ? edge.target : edge.source;
        const edgeSet = direction === 'down' ? downstreamEdges : upstreamEdges;
        edgeSet.add(edge.id);

        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      });

      visited.forEach((id) => {
        if (direction === 'down') downstream.add(id);
        else upstream.add(id);
      });
    }
  };

  walk(startId, 'up');
  walk(startId, 'down');

  return {
    upstream,
    downstream,
    upstreamEdges,
    downstreamEdges,
    relatedNodes: new Set<string>([startId, ...upstream, ...downstream]),
    relatedEdges: new Set<string>([...upstreamEdges, ...downstreamEdges]),
  };
};

const deriveMismatchAlerts = (edges: any[], focusNodeId?: string | null) => {
  const grouped = new Map<string, any[]>();
  edges.forEach((edge) => {
    const key = `${edge.source}::${edge.target}::${edge.data?.port || ''}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(edge);
  });

  const alerts: Array<{ id: string; title: string; detail: string; severity: 'warn' | 'error' }> = [];

  grouped.forEach((group, key) => {
    const httpEdges = group.filter((edge) => edge.data?.endpoint || edge.data?.method || edge.data?.statusCode != null);
    const errorEdges = group.filter((edge) => Number(edge.data?.statusCode || 0) >= 400);

    if (httpEdges.length > 0 && errorEdges.length > 0) {
      const sample = errorEdges[0];
      alerts.push({
        id: key,
        title: 'L7 contract degradation',
        detail: `${sample.data?.originService || sample.source} → ${sample.target} is returning ${sample.data?.statusCode || '4xx/5xx'} for ${sample.data?.endpoint || 'an HTTP route'}.`,
        severity: Number(sample.data?.statusCode || 0) >= 500 ? 'error' : 'warn',
      });
    }
  });

  if (focusNodeId) {
    return alerts.slice(0, 5);
  }

  return alerts.slice(0, 3);
};

export default function Home() {
  const { selectedContext, selectedNamespace } = useKubeGlobal();
  const [allNodes, setAllNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [socket, setSocket] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedPodName, setSelectedPodName] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPods, setShowPods] = useState(false);
  const [blastRadiusMode, setBlastRadiusMode] = useState(false);
  const [timeTravelMinutes, setTimeTravelMinutes] = useState(0);
  const [graphHistory, setGraphHistory] = useState<{ ts: string; nodes: any[]; edges: any[] }[]>([]);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusNodeIds, setFocusNodeIds] = useState<string[]>([]);
  const [focusEdgeIds, setFocusEdgeIds] = useState<string[]>([]);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'telemetry' | 'logs'>('telemetry');
  const graphStateRef = useRef<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });

  // Filter nodes based on showPods toggle
  const nodes = showPods ? allNodes : allNodes.filter((n) => n.data?.type !== 'pod');

  const recordSnapshot = useCallback((nextNodes: any[], nextEdges: any[]) => {
    const snapshot = cloneGraph(nextNodes, nextEdges);
    const ts = new Date().toISOString();
    graphStateRef.current = snapshot;
    setGraphHistory((prev) => [...prev, { ts, ...snapshot }].filter((item) => Date.now() - new Date(item.ts).getTime() <= 2 * 60 * 60 * 1000).slice(-120));
  }, []);

  const visibleSnapshot = useMemo(() => {
    const snapshot = timeTravelMinutes > 0 ? findNearestSnapshot(graphHistory, timeTravelMinutes) : null;
    const sourceNodes = snapshot?.nodes || allNodes;
    const sourceEdges = snapshot?.edges || edges;
    return {
      ts: snapshot?.ts || new Date().toISOString(),
      nodes: sourceNodes,
      edges: sourceEdges,
    };
  }, [allNodes, edges, graphHistory, timeTravelMinutes]);

  const blastFocus = useMemo(() => {
    if (!blastRadiusMode || !focusNodeId) {
      return {
        relatedNodes: new Set<string>(),
        relatedEdges: new Set<string>(),
        upstream: new Set<string>(),
        downstream: new Set<string>(),
      };
    }

    return traverseGraph(focusNodeId, visibleSnapshot.edges);
  }, [blastRadiusMode, focusNodeId, visibleSnapshot.edges]);

  const highlightedNodes = useMemo(() => {
    if (!blastRadiusMode || !focusNodeId) return null;
    return blastFocus.relatedNodes;
  }, [blastRadiusMode, blastFocus, focusNodeId]);

  const highlightedEdges = useMemo(() => {
    if (!blastRadiusMode || !focusNodeId) return null;
    return blastFocus.relatedEdges;
  }, [blastRadiusMode, blastFocus, focusNodeId]);

  const mismatchAlerts = useMemo(() => deriveMismatchAlerts(visibleSnapshot.edges, focusNodeId), [visibleSnapshot.edges, focusNodeId]);

  const displayNodes = useMemo(() => {
    return visibleSnapshot.nodes
      .filter((node) => showPods || node.data?.type !== 'pod')
      .map((node) => {
        const isFocused = !highlightedNodes || highlightedNodes.has(node.id);
        const opacity = blastRadiusMode && focusNodeId && !isFocused ? 0.18 : 1;
        return {
          ...node,
          style: {
            ...(node.style || {}),
            opacity,
            transition: 'opacity 180ms ease, transform 180ms ease',
            boxShadow: isFocused && blastRadiusMode ? '0 0 0 1px rgba(173,198,255,0.24), 0 0 34px rgba(173,198,255,0.08)' : node.style?.boxShadow,
          },
          selected: node.id === focusNodeId,
        };
      });
  }, [blastRadiusMode, focusNodeId, highlightedNodes, showPods, visibleSnapshot.nodes]);

  const displayEdges = useMemo(() => {
    return visibleSnapshot.edges.map((edge) => {
      const isFocused = !highlightedEdges || highlightedEdges.has(edge.id);
      const muted = blastRadiusMode && focusNodeId && !isFocused;
      const endpointLabel = edge.data?.endpoint || edge.label;
      const isError = Number(edge.data?.statusCode || 0) >= 400;
      return {
        ...edge,
        label: endpointLabel,
        animated: edge.animated && !muted,
        style: {
          ...(edge.style || {}),
          opacity: muted ? 0.12 : 1,
          strokeWidth: isFocused && !muted ? Math.max(3, edge.style?.strokeWidth || 3) : edge.style?.strokeWidth || 2,
          stroke: isError ? '#ff4d6d' : edge.style?.stroke || (muted ? '#64748b' : 'var(--color-primary-container)'),
          filter: isError ? 'drop-shadow(0 0 10px rgba(255,77,109,0.35))' : undefined,
          transition: 'opacity 180ms ease, stroke 180ms ease',
        },
      };
    });
  }, [blastRadiusMode, focusNodeId, highlightedEdges, visibleSnapshot.edges]);

  const selectedFocusSummary = useMemo(() => {
    if (!focusNodeId) return null;
    const focusNode = visibleSnapshot.nodes.find((node) => node.id === focusNodeId);
    const incoming = visibleSnapshot.edges.filter((edge) => edge.target === focusNodeId);
    const outgoing = visibleSnapshot.edges.filter((edge) => edge.source === focusNodeId);

    return {
      node: focusNode,
      incoming,
      outgoing,
      upstreamCount: blastFocus.upstream.size,
      downstreamCount: blastFocus.downstream.size,
    };
  }, [blastFocus.downstream.size, blastFocus.upstream.size, focusNodeId, visibleSnapshot.edges, visibleSnapshot.nodes]);

  const graphFitKey = useMemo(() => {
    return `${showPods ? 'pods-on' : 'pods-off'}-${timeTravelMinutes}-${visibleSnapshot.nodes.length}-${visibleSnapshot.edges.length}`;
  }, [showPods, timeTravelMinutes, visibleSnapshot.nodes.length, visibleSnapshot.edges.length]);

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
      setAllNodes([]);
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
        setAllNodes([]);
        setEdges([]);
        recordSnapshot([], []);
        return;
      }

      // Map nodes - auto-detect type from data
      const mappedNodes = data.nodes.map((n: any) => ({
        ...n,
        type: n.data?.type || n.type || 'pod',
      }));

      // Apply hierarchical top-to-bottom layout
      const layoutedNodes = layoutTopToBottom(mappedNodes, data.edges || []);

      // Map edges - auto-detect styling based on node types
      const mappedEdges = data.edges.map((e: any) => {
        const sourceNode = data.nodes.find((n: any) => n.id === e.source);
        const targetNode = data.nodes.find((n: any) => n.id === e.target);
        const sourceType = sourceNode?.data?.type || sourceNode?.type || 'pod';
        const targetType = targetNode?.data?.type || targetNode?.type || 'pod';
        console.log(`Edge ${e.id}: sourceType=${sourceType}, targetType=${targetType}`);
        // Determine if special edge (service-to-service, pod-to-db, etc)
        const isSpecialConnection = sourceType !== 'pod' || targetType !== 'pod';
        const statusCode = Number(e.data?.statusCode || 0);
        const durationMs = Number(e.data?.durationMs || 0);
        const isError = statusCode >= 400;
        const thickness = Math.max(2, Math.min(6, durationMs > 0 ? Math.round(durationMs / 150) + 2 : 3));
        
        return {
          ...e,
          type: e.type || 'custom',
          markerEnd: { type: MarkerType.ArrowClosed, color: isError ? '#ff4d6d' : isSpecialConnection ? '#f97316' : 'var(--color-primary-container)' },
          style: isError
            ? { strokeWidth: thickness + 1, stroke: '#ff4d6d', strokeDasharray: '2,3' }
            : isSpecialConnection 
              ? { strokeWidth: Math.max(3, thickness), stroke: '#f97316', strokeDasharray: '5,5' } 
              : { strokeWidth: thickness, stroke: 'var(--color-primary-container)' },
          animated: true,
        };
      });

      // Merge nodes: update positions/data for existing, add new
      const nextNodes = layoutedNodes;
      const nextEdges = mappedEdges;
      graphStateRef.current = { nodes: nextNodes, edges: nextEdges };

      setAllNodes(nextNodes);
      setEdges(nextEdges);
      recordSnapshot(nextNodes, nextEdges);
    });

    // Handle telemetry deltas emitted from backend. The payload is expected to
    // contain an `edge` and optionally `newNodes`. Merge them locally and
    // debounce layout recalculation to avoid repeated heavy requests.
    const layoutDebounceRef = { current: null as any };

    const processTelemetry = (payload: any) => {
      if (!payload) return;

      const incomingEdge = payload.edge || payload;
      const incomingNewNodes = payload.newNodes;
      let nextNodes = graphStateRef.current.nodes;
      let nextEdges = graphStateRef.current.edges;

      if (incomingNewNodes && Array.isArray(incomingNewNodes) && incomingNewNodes.length > 0) {
        const ids = new Set(nextNodes.map((n) => n.id));
        const toAdd = incomingNewNodes.filter((n: any) => !ids.has(n.id)).map((n: any) => ({ ...n, type: n.data?.type || n.type || 'pod' }));
        if (toAdd.length > 0) {
          nextNodes = [...nextNodes, ...toAdd];
        }
      }

      if (incomingEdge && incomingEdge.id) {
        const exists = nextEdges.some((e) => e.id === incomingEdge.id);

        // Auto-detect edge type based on node type data
        let isSpecialEdge = false;
        if (incomingEdge.data) {
          const sourceType = incomingEdge.data.sourceType || incomingEdge.sourceType;
          const targetType = incomingEdge.data.targetType || incomingEdge.targetType;
          isSpecialEdge = sourceType !== 'pod' || targetType !== 'pod';
        }

        const statusCode = Number(incomingEdge.data?.statusCode || incomingEdge.statusCode || 0);
        const durationMs = Number(incomingEdge.data?.durationMs || incomingEdge.durationMs || 0);
        const isError = statusCode >= 400;
        const thickness = Math.max(2, Math.min(6, durationMs > 0 ? Math.round(durationMs / 150) + 2 : 3));

        const normalized = {
          id: incomingEdge.id,
          source: incomingEdge.source,
          target: incomingEdge.target,
          animated: incomingEdge.animated ?? true,
          label: incomingEdge.label ?? undefined,
          data: incomingEdge.data ?? incomingEdge,
          style: isError
            ? { strokeWidth: thickness + 1, stroke: '#ff4d6d', strokeDasharray: '2,3' }
            : isSpecialEdge
              ? { strokeWidth: Math.max(3, thickness), stroke: '#f97316', strokeDasharray: '5,5' }
              : incomingEdge.style ?? { strokeWidth: thickness, stroke: '#10b981' },
          type: incomingEdge.type ?? 'custom',
          markerEnd: { type: MarkerType.ArrowClosed, color: isError ? '#ff4d6d' : isSpecialEdge ? '#f97316' : '#10b981' },
        } as any;

        if (exists) {
          nextEdges = nextEdges.map((e) => (e.id === normalized.id ? { ...e, ...normalized } : e));
        } else {
          nextEdges = [...nextEdges, normalized];
        }
      }

      graphStateRef.current = { nodes: nextNodes, edges: nextEdges };
      setAllNodes(nextNodes);
      setEdges(nextEdges);
      recordSnapshot(nextNodes, nextEdges);

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
  }, [isLoading, selectedContext, selectedNamespace, setAllNodes, setEdges]);

  // Request update when context/namespace changes explicitly
  useEffect(() => {
    if (socket && selectedContext && selectedNamespace) {
      socket.emit('requestUpdate', { context: selectedContext, namespace: selectedNamespace });
    }
  }, [socket, selectedContext, selectedNamespace]);

  const onNodeClick = useCallback((event: any, node: any) => {
    setSelectedNode(node);
    setFocusNodeId(node.id);
    setIsPanelOpen(true);
    setActiveDrawerTab('telemetry');

    const selectedType = node.data?.type || 'pod';
    let podTarget = selectedType === 'pod' ? node.data?.label || '' : '';

    if (!podTarget) {
      const connectedEdges = visibleSnapshot.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
      const connectedPod = visibleSnapshot.nodes.find((candidate) => {
        if (candidate.data?.type !== 'pod') return false;
        return connectedEdges.some((edge) => edge.source === candidate.id || edge.target === candidate.id);
      });
      podTarget = connectedPod?.data?.label || '';
    }

    setSelectedPodName(podTarget);
    if (podTarget && socket && selectedContext && selectedNamespace) {
      setLogs([]);
      socket.emit('subscribeLogs', {
        context: selectedContext,
        namespace: selectedNamespace,
        podName: podTarget,
      });
    }

    if (blastRadiusMode) {
      const focus = traverseGraph(node.id, visibleSnapshot.edges);
      setFocusNodeIds(Array.from(focus.relatedNodes));
      setFocusEdgeIds(Array.from(focus.relatedEdges));
    }
  }, [blastRadiusMode, selectedContext, selectedNamespace, socket, visibleSnapshot.edges, visibleSnapshot.nodes]);

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    if (socket && selectedPodName) {
      socket.emit('unsubscribeLogs');
    }
    setSelectedNode(null);
    setSelectedPodName('');
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <DashboardLayout>
      <div className="w-full h-full relative overflow-hidden">
        <div className="sticky top-0 z-20 mx-4 mt-4 mb-3 rounded-3xl border border-white/8 bg-surface-container/70 backdrop-blur-xl shadow-[0_12px_50px_rgba(0,0,0,0.22)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-outline-variant">Topology Control</div>
              <div className="text-sm text-on-surface font-medium">Blast Radius, pod expansion, and replay</div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  setBlastRadiusMode((v) => !v);
                  if (blastRadiusMode) {
                    setFocusNodeId(null);
                    setFocusNodeIds([]);
                    setFocusEdgeIds([]);
                  }
                }}
                className={`px-4 py-2 rounded-2xl border text-sm transition-all ${blastRadiusMode ? 'border-error/30 bg-error/10 text-error' : 'border-white/8 bg-white/5 text-on-surface hover:bg-white/10'}`}
              >
                {blastRadiusMode ? 'Blast Radius ON' : 'Blast Radius OFF'}
              </button>

              <label className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-white/8 bg-white/5 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={showPods}
                  onChange={(e) => setShowPods(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                Show Pod Details
              </label>

              <div className="px-4 py-2 rounded-2xl border border-white/8 bg-white/5 text-xs text-outline-variant">
                {visibleSnapshot.ts ? `View: ${new Date(visibleSnapshot.ts).toLocaleTimeString()}` : 'Live view'}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/8 bg-white/5">
              <span className="text-xs uppercase tracking-[0.18em] text-outline-variant whitespace-nowrap">Time travel</span>
              <button onClick={() => setTimeTravelMinutes(0)} className={`text-xs px-2 py-1 rounded-full ${timeTravelMinutes === 0 ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant'}`}>Live</button>
              <button onClick={() => setTimeTravelMinutes(5)} className={`text-xs px-2 py-1 rounded-full ${timeTravelMinutes === 5 ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant'}`}>5m</button>
              <button onClick={() => setTimeTravelMinutes(30)} className={`text-xs px-2 py-1 rounded-full ${timeTravelMinutes === 30 ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant'}`}>30m</button>
              <button onClick={() => setTimeTravelMinutes(120)} className={`text-xs px-2 py-1 rounded-full ${timeTravelMinutes === 120 ? 'bg-primary/15 text-primary-fixed' : 'text-outline-variant'}`}>2h</button>
              <input
                type="range"
                min={0}
                max={120}
                step={5}
                value={timeTravelMinutes}
                onChange={(e) => setTimeTravelMinutes(Number(e.target.value))}
                className="w-55 accent-primary"
              />
              <span className="text-xs text-outline-variant w-12 text-right">{timeTravelMinutes}m</span>
            </div>

            {blastRadiusMode && focusNodeId && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-error/20 bg-error/10 text-xs text-error">
                <span>Focused: {selectedNode?.data?.label || focusNodeId}</span>
                <span>Upstream {blastFocus.upstream.size}</span>
                <span>Downstream {blastFocus.downstream.size}</span>
                <button
                  onClick={() => {
                    setFocusNodeId(null);
                    setFocusNodeIds([]);
                    setFocusEdgeIds([]);
                  }}
                  className="ml-2 px-2 py-1 rounded-full border border-error/30 bg-error/10"
                >
                  Clear
                </button>
              </div>
            )}

            {mismatchAlerts.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 text-xs text-amber-200">
                <span>⚠</span>
                <span>{mismatchAlerts.length} topology alerts</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-4 h-[calc(100%-124px)]">
          <GraphCanvas
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitViewKey={graphFitKey}
          />
        </div>

        <ActionPanel
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          podName={selectedPodName || selectedNode?.data?.label || ''}
          logs={logs}
          nodeData={selectedNode}
          edges={visibleSnapshot.edges}
          activeTab={activeDrawerTab}
          onTabChange={setActiveDrawerTab}
          blastMode={blastRadiusMode}
          blastFocus={selectedFocusSummary}
          mismatchAlerts={mismatchAlerts}
          timeTravelMinutes={timeTravelMinutes}
          onToggleBlastMode={() => setBlastRadiusMode((v) => !v)}
        />
      </div>
    </DashboardLayout>
  );
}
