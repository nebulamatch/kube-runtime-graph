import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Box, Database, Globe } from 'lucide-react';
import styles from '../app/page.module.css';

export default function CustomNode({ data }: NodeProps) {
  const isError = data.errorRate > 5;
  const isWarning = data.errorRate > 0 && data.errorRate <= 5;
  
  const getIcon = () => {
    switch (data.type) {
      case 'db': return <Database size={16} color="#3b82f6" />;
      case 'external': return <Globe size={16} color="#10b981" />;
      default: return <Box size={16} color="#8b5cf6" />;
    }
  };

  return (
    <div className={`${styles.customNode} ${isError ? styles.error : ''} ${isWarning ? styles.warning : ''}`}>
      <Handle type="target" position={Position.Top} />
      
      <div className={styles.nodeHeader}>
        <div className={styles.nodeLabel}>
          {getIcon()}
          <span>{data.label}</span>
        </div>
      </div>
      
      <div className={styles.nodeMetrics}>
        <span>RPS:</span>
        <span className={styles.metricValue}>{data.rps || 0}</span>
      </div>
      <div className={styles.nodeMetrics}>
        <span>Latency:</span>
        <span className={styles.metricValue}>{data.latency || '0ms'}</span>
      </div>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
