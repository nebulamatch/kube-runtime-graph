import React, { useMemo, useEffect } from 'react';
import ReactFlow, { Background, Controls, NodeTypes, EdgeTypes, useReactFlow, ReactFlowProvider } from 'reactflow';
import { CustomPodNode } from '../molecules/CustomPodNode';
import { Badge } from '../atoms/Badge';

type GraphCanvasProps = {
  nodes: any[];
  edges: any[];
  onNodesChange: any;
  onEdgesChange: any;
  onNodeClick: any;
};

// Edge with label badge
const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }: any) => {
  const edgePath = `M${sourceX},${sourceY} C${sourceX},${(sourceY + targetY) / 2} ${targetX},${(sourceY + targetY) / 2} ${targetX},${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  // Determine variant based on HTTP method
  let badgeVariant = 'default';
  if (data?.label) {
    if (data.label.includes('GET')) badgeVariant = 'http-get';
    if (data.label.includes('POST')) badgeVariant = 'http-post';
    if (data.label.includes('PUT')) badgeVariant = 'http-put';
    if (data.label.includes('DELETE')) badgeVariant = 'http-delete';
  }

  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path animate-pulse stroke-primary-container" d={edgePath} markerEnd={markerEnd} />
      {data?.label && (
        <foreignObject
          width={150}
          height={40}
          x={labelX - 75}
          y={labelY - 20}
          className="flex items-center justify-center pointer-events-none"
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <div className="flex justify-center w-full h-full pt-2">
            <Badge text={data.label} variant={badgeVariant as any} />
          </div>
        </foreignObject>
      )}
    </>
  );
};

const GraphCanvasComponent: React.FC<GraphCanvasProps> = ({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick }) => {
  const { fitView } = useReactFlow();
  const initialFitDoneRef = React.useRef(false);

  // Auto fit view only once on first nodes arrival to avoid resetting user zoom/pan
  useEffect(() => {
    if (!initialFitDoneRef.current && nodes.length > 0) {
      initialFitDoneRef.current = true;
      const timer = setTimeout(() => {
        try {
          fitView({ padding: 0.15, duration: 600 });
        } catch (e) {
          // ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  // Memoize nodeTypes and edgeTypes to prevent React Flow infinite re-render warning
  const nodeTypes: NodeTypes = useMemo(() => ({
    pod: CustomPodNode,
    service: CustomPodNode,
    db: CustomPodNode,
    custom: CustomPodNode,
    default: CustomPodNode,
  }), []);
  const edgeTypes: EdgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        className="bg-transparent"
        minZoom={0.1}
        maxZoom={1.5}
      >
        <Background color="var(--color-on-surface-variant)" gap={24} size={1} />
        <Controls className="bg-surface-container-low border-white/10 fill-on-surface" />
      </ReactFlow>
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvasComponent {...props} />
    </ReactFlowProvider>
  );
};
